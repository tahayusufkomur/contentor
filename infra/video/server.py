"""The reels' video service, internal only (no port is published): ffmpeg and a face detector behind a tiny
HTTP API, called by backend/apps/reels.

    POST /faces   {url, start, end, fps?}  -> {width, height, duration, samples: [[t, [[x, y, w, h, score]]]]}
                  The faces in a stretch of the video, a few times a second (t from `start`; boxes as shares
                  of the frame), for the crop that follows the coach.
    POST /render  {job}                    -> {duration, size}
                  One reel made (graph.py) and uploaded to the job's presigned PUT link.
    GET  /health

Faces: YuNet (OpenCV Zoo, MIT), a few ms a frame on the CPU. One render and one face scan at a time: a
render holds every core it is given for a few seconds. ponytail: two locks; a queue in front if reels
traffic ever makes coaches wait.
"""

import base64
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np

import graph

MODEL = os.environ.get("FACE_MODEL", "/models/yunet.onnx")
THREADS = int(os.environ.get("VIDEO_THREADS", "6"))
MAX_JOB = 64 * 1024 * 1024  # a job carries its end card and photos inline
MAX_FONT = 8 * 1024 * 1024
FONTS = Path(tempfile.gettempdir()) / "fonts"
SCAN_WIDTH = 640
RENDER_LOCK, FACES_LOCK = threading.Lock(), threading.Lock()


def probe(url: str) -> dict:
    """The source's frame size as it plays (a phone video's rotation applied), length and sound."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", url],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    info = json.loads(out.stdout)
    streams = info.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise graph.JobError("the source has no video")
    width, height = int(video["width"]), int(video["height"])
    rotation = int(float((video.get("tags") or {}).get("rotate") or 0))
    for side in video.get("side_data_list") or []:
        rotation = int(float(side.get("rotation", rotation)))
    if abs(rotation) % 180 == 90:
        width, height = height, width
    return {
        "width": width,
        "height": height,
        "duration": float((info.get("format") or {}).get("duration") or 0),
        "audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def faces(url: str, start: float, end: float, fps: float) -> dict:
    found = probe(url)
    w = SCAN_WIDTH
    h = graph.even(w * found["height"] / found["width"])
    proc = subprocess.Popen(
        ["ffmpeg", "-nostdin", "-v", "error", "-ss", str(start), "-t", str(max(0.1, end - start)), "-i", url]
        + ["-vf", f"fps={fps},scale={w}:{h}", "-an", "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,  # (-v error: a line or two, never enough to fill the pipe)
    )
    detector = cv2.FaceDetectorYN.create(MODEL, "", (w, h), 0.6, 0.3, 20)
    samples, size, i = [], w * h * 3, 0
    try:
        while True:
            frame = proc.stdout.read(size)
            if len(frame) < size:
                break
            _, seen = detector.detect(np.frombuffer(frame, np.uint8).reshape(h, w, 3))
            boxes = [  # (numpy's float32 is no JSON number)
                [round(float(f[0]) / w, 4), round(float(f[1]) / h, 4), round(float(f[2]) / w, 4)]
                + [round(float(f[3]) / h, 4), round(float(f[-1]), 3)]
                for f in (seen if seen is not None else [])
            ]
            samples.append([round(i / fps, 3), boxes])
            i += 1
    finally:
        proc.stdout.close()
        error = proc.stderr.read().decode(errors="replace").strip()
        proc.wait(timeout=60)
    if proc.returncode != 0 and not samples:
        raise RuntimeError("ffmpeg: " + error[-800:])
    return {"width": found["width"], "height": found["height"], "duration": found["duration"], "samples": samples}


def _font(url: str) -> Path | None:
    """A font file, fetched once per container."""
    if not str(url).startswith("https://"):
        return None
    path = FONTS / (hashlib.sha1(url.encode(), usedforsecurity=False).hexdigest() + ".ttf")
    if not path.exists():
        FONTS.mkdir(exist_ok=True)
        with urllib.request.urlopen(url, timeout=20) as res:  # noqa: S310 (https only, above)
            body = res.read(MAX_FONT)
        part = path.with_suffix(".part")
        part.write_bytes(body)
        part.rename(path)
    return path


def _family(path: Path) -> str:
    """The family libass knows the file by: its legacy name (a static weight is its own family there, like
    "Montserrat ExtraBold"), which fontconfig lists after the typographic one ("Montserrat")."""
    out = subprocess.run(["fc-scan", "--format", "%{family}", str(path)], capture_output=True, text=True, timeout=10)
    return out.stdout.strip().split(",")[-1].strip() or "DejaVu Sans"


def _image(data: str, path: Path) -> str:
    path.write_bytes(base64.b64decode(data, validate=True))
    return str(path)


def render(job: dict) -> dict:
    found = probe(str(job.get("source") or ""))
    upload = str(job.get("upload") or "")
    if not upload.startswith(("http://", "https://")):
        raise graph.JobError("the upload is not a link")
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        fonts = work / "fonts"
        fonts.mkdir()
        families = {}
        for role, url in (job.get("fonts") or {}).items():
            try:
                path = _font(url)
            except OSError:
                path = None  # a font that can't be fetched falls back to the bundled one
            if path:
                shutil.copy(path, fonts / path.name)
                families[role] = _family(path)
        paths = {"fonts": str(fonts), "out": str(work / "reel.mp4"), "cutaways": []}
        if job.get("captions"):
            ass = work / "captions.ass"
            ass.write_text(graph.fill_fonts(str(job["captions"]), families), encoding="utf-8")
            paths["ass"] = str(ass)
        if job.get("end_card"):
            paths["end_card"] = _image(job["end_card"], work / "end.png")
        for i, cut in enumerate(job.get("cutaways") or []):
            paths["cutaways"].append(_image(cut.get("image") or "", work / f"cut{i}.jpg"))
        args, total = graph.command(job, found, paths, THREADS)
        done = subprocess.run(args, capture_output=True, text=True, timeout=30 * 60)
        if done.returncode != 0:
            raise RuntimeError("ffmpeg: " + done.stderr.strip()[-800:])
        out = Path(paths["out"])
        size = out.stat().st_size
        with out.open("rb") as body:
            put = urllib.request.Request(  # noqa: S310 (checked above)
                upload, data=body, method="PUT", headers={"Content-Type": "video/mp4", "Content-Length": str(size)}
            )
            with urllib.request.urlopen(put, timeout=600) as res:  # noqa: S310
                res.read()
    return {"duration": total, "size": size}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 (the stdlib's name)
        if self.path == "/health":
            return self._send(200, {"ok": True})
        return self._send(404, {"detail": "not found"})

    def do_POST(self):  # noqa: N802
        if self.path not in ("/faces", "/render"):
            return self._send(404, {"detail": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_JOB:
            return self._send(400, {"detail": "send a JSON job"})
        try:
            job = json.loads(self.rfile.read(length))
            if self.path == "/faces":
                with FACES_LOCK:
                    start, end = float(job["start"]), float(job["end"])
                    return self._send(200, faces(str(job["url"]), start, end, float(job.get("fps") or 4)))
            with RENDER_LOCK:
                return self._send(200, render(job))
        except (graph.JobError, KeyError, TypeError, ValueError) as exc:
            return self._send(400, {"detail": str(exc)[:300]})
        except Exception as exc:  # ffmpeg, the network, a file it can't read
            return self._send(422, {"detail": f"{type(exc).__name__}: {str(exc)[:900]}"})

    def log_message(self, fmt, *args):  # one line per request, as the other services log
        print(f"video: {self.command} {self.path} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    print("video: listening on 7100", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 7100), Handler).serve_forever()  # noqa: S104 (internal network only)
