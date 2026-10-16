"""Lay record.ts's live-class video (screen-*.webm, mara-screens flow) onto the
green screens of the "every screen" photographs (photos/screens-*.jpg,
Pix4Less), writing photos/screens-<device>-frames/NNNN.png for encode.sh,
which plays them forward then back into a seamless loop. Only green pixels
take the video, so fingers in front of a screen stay in front.

    python scripts/footage/screens.py   # needs opencv-python-headless + numpy + ffmpeg
"""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

RAW = Path(__file__).resolve().parents[2] / "e2e/eval-shots/footage"
WIDTH = 960  # the frames' width; encode.sh crops them to 4:5
SECONDS = 3.0  # of class per screen, before the loop plays it back
# device: crop (x, y, w, h as fractions of the photo; None keeps it whole) and
# erase (x0, y0, x1, y1 px boxes of the full photo, inpainted first: the brand
# the model drew). The video is warped whole onto the screen's corners: the
# perspective is the foreshortening, so nothing is cropped.
DEVICES = {
    "laptop": {"crop": None, "erase": [(1195, 1468, 1285, 1496)]},
    "tablet": {"crop": None, "erase": []},
    "phone": {"crop": (0.2, 0.08, 0.7, 0.705), "erase": []},
}


def green_mask(img: np.ndarray, lo=(40, 90, 90)) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, lo, (90, 255, 255))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    return cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)


def screen_quad(mask: np.ndarray) -> np.ndarray:
    """The largest green region's four corners, TL TR BR BL."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull = cv2.convexHull(max(contours, key=cv2.contourArea))
    peri = cv2.arcLength(hull, True)
    for eps in np.linspace(0.01, 0.1, 40):
        approx = cv2.approxPolyDP(hull, eps * peri, True)
        if len(approx) == 4:
            break
    else:
        raise SystemExit("no four-cornered screen found")
    pts = approx.reshape(4, 2).astype(np.float32)
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]])


class Screen:
    """One photo's screen: where it is and how much of each pixel it takes."""

    def __init__(self, photo: np.ndarray):
        self.photo = photo.astype(np.float32)
        self.quad = screen_quad(green_mask(photo))
        q = self.quad
        self.w = int(max(np.linalg.norm(q[1] - q[0]), np.linalg.norm(q[2] - q[3])))
        self.h = int(max(np.linalg.norm(q[3] - q[0]), np.linalg.norm(q[2] - q[1])))
        src = np.float32([[0, 0], [self.w * 2, 0], [self.w * 2, self.h * 2], [0, self.h * 2]])
        self.m = cv2.getPerspectiveTransform(src, q)
        # The screen's green, its shaded edges too, takes the video: inside the
        # corners that is the screen, just outside it is dark like a bezel.
        inside = np.zeros(photo.shape[:2], np.uint8)
        cv2.fillConvexPoly(inside, q.astype(np.int32), 255)
        near = cv2.dilate(inside, np.ones((17, 17), np.uint8))
        a = cv2.bitwise_and(green_mask(photo, (35, 50, 20)), near)
        self.alpha = cv2.GaussianBlur(a, (3, 3), 0).astype(np.float32)[..., None] / 255
        self.ring = near > 0

    def show(self, frame: np.ndarray) -> np.ndarray:
        # Downscale first (area filter), then warp: no aliasing on the UI text.
        frame = cv2.resize(frame, (self.w * 2, self.h * 2), interpolation=cv2.INTER_AREA)
        warped = cv2.warpPerspective(frame, self.m, self.photo.shape[1::-1], flags=cv2.INTER_CUBIC)
        out = warped.astype(np.float32) * self.alpha + self.photo * (1 - self.alpha)
        # Despill: the green fringe on fingers and bezel goes neutral.
        b, g, r = cv2.split(out)
        cap = np.maximum(b, r)
        g = np.where(self.ring & (g > cap), cap + (g - cap) * 0.2, g)
        return np.clip(cv2.merge([b, g, r]), 0, 255).astype(np.uint8)


marks = json.loads((RAW / "mara-screens.marks.json").read_text())
for device, o in DEVICES.items():
    photo = cv2.imread(str(RAW / f"photos/screens-{device}.jpg"))
    for x0, y0, x1, y1 in o["erase"]:
        hole = np.zeros(photo.shape[:2], np.uint8)
        hole[y0:y1, x0:x1] = 255
        photo = cv2.inpaint(photo, hole, 3, cv2.INPAINT_TELEA)
    if crop := o["crop"]:
        H, W = photo.shape[:2]
        x, y, w, h = crop
        photo = photo[int(y * H) : int((y + h) * H), int(x * W) : int((x + w) * W)]
    H, W = photo.shape[:2]
    photo = cv2.resize(photo, (WIDTH, round(H * WIDTH / W / 2) * 2), interpolation=cv2.INTER_AREA)
    screen = Screen(photo)
    out = RAW / f"photos/screens-{device}-frames"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir()
    with tempfile.TemporaryDirectory() as tmp:
        cmd = ["ffmpeg", "-v", "error", "-ss", str(marks[f"screen-{device}"]), "-t", str(SECONDS)]
        cmd += ["-i", str(RAW / f"screen-{device}.webm"), "-vf", "fps=25", f"{tmp}/%04d.png"]
        subprocess.run(cmd, check=True)  # noqa: S603 (ffmpeg, fixed arguments, no shell)
        for f in sorted(Path(tmp).glob("*.png")):
            cv2.imwrite(str(out / f.name), screen.show(cv2.imread(str(f))))
    print(f"{device}: screen ~{screen.w}x{screen.h}, {len(list(out.glob('*.png')))} frames")
