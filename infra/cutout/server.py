"""The background remover's HTTP API, internal only (no port is published).

    POST /remove   the picture's bytes -> a PNG of it, see-through where its background was
    GET  /health

One picture at a time: an inference takes the service to ~1.5 GB for a few seconds, and two at once would
double that. ponytail: one lock; a queue in front of it if photo studio traffic ever makes coaches wait.
"""

import io
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image
from rembg import new_session, remove

MAX_BYTES = 40 * 1024 * 1024  # larger than any camera photo; the studio sends optimized ones
SESSION = new_session(os.environ.get("CUTOUT_MODEL", "isnet-general-use"))
LOCK = threading.Lock()
# The model's mask is soft all over: the subject comes back a little see-through (most of it 215-254, not
# 255), and what it was unsure of in the background stays as a faint ghost (up to ~90: a desk, a screen).
# The curve clears the one and fills in the other, and keeps a soft edge between them (hair).
GHOST, SOLID = 96, 200
CURVE = [0 if v < GHOST else 255 if v > SOLID else round((v - GHOST) * 255 / (SOLID - GHOST)) for v in range(256)]


def cleaned(png: bytes) -> bytes:
    with Image.open(io.BytesIO(png)) as im:
        im = im.convert("RGBA")
        im.putalpha(im.getchannel("A").point(CURVE))
        out = io.BytesIO()
        im.save(out, "PNG", optimize=True)
        return out.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, kind: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 (the stdlib's name)
        if self.path == "/health":
            return self._send(200, b'{"ok": true}')
        return self._send(404, b'{"detail": "not found"}')

    def do_POST(self):  # noqa: N802
        if self.path != "/remove":
            return self._send(404, b'{"detail": "not found"}')
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BYTES:
            return self._send(400, b'{"detail": "send the picture, at most 40 MB"}')
        body = self.rfile.read(length)
        try:
            with LOCK:
                out = remove(body, session=SESSION)
            # (remove answers in the kind it is given: bytes in, PNG bytes out)
            out = cleaned(out)
        except Exception as exc:  # not a picture it can read
            return self._send(422, f'{{"detail": "{type(exc).__name__}"}}'.encode())
        return self._send(200, out, "image/png")

    def log_message(self, fmt, *args):  # one line per request, as the other services log
        print(f"cutout: {self.command} {self.path} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    print("cutout: listening on 7000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 7000), Handler).serve_forever()  # noqa: S104 (internal network only)
