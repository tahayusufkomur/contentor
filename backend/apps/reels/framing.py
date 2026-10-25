"""Where a reel's 9:16 window sits on the video's frame: following the coach's face (from the video service's
face scan), in the middle, or the whole frame shown on a blurred copy of itself ("fit": slides, a screen, a
group). Pure functions; the front end's preview and the render both draw from frame_of.
"""

LAYOUTS = ("auto", "center", "fit")
MARGIN = 3.0  # seconds scanned before and after a reel's stretch: a small trim needs no new scan
SCORE = 0.6  # the detector's confidence below which a face is ignored
DEAD_ZONE = 0.2  # how far (a share of the window's width) the face may drift before the window follows
PAN = 0.6  # seconds the window takes to follow
MIN_SEEN = 0.4  # the share of the samples that must show a face for the window to follow one
WIDE = 9 / 16 / (16 / 9)  # the window's share of a 16:9 frame, while the frame's size is not known


def share(width, height) -> float:
    """The window's width as a share of the frame's: 1 for a frame already 9:16 or narrower."""
    if not width or not height:
        return round(WIDE, 4)
    return round(min(1.0, height * 9 / 16 / width), 4)


def scanned(reel) -> bool:
    """Whether the face scan covers the reel's stretch."""
    faces = reel.faces or {}
    if faces.get("samples") is None:
        return False
    return faces.get("from", 0) <= reel.start + 0.01 and faces.get("to", 0) >= reel.end - 0.01


def _centre(boxes, previous):
    """The centre (a share of the width) of the face the window follows in one sample: the largest, unless
    one nearly as large is where the last one was."""
    faces = [b for b in boxes if len(b) >= 5 and b[4] >= SCORE and b[2] > 0 and b[3] > 0]
    if not faces:
        return None
    pick = max(faces, key=lambda b: b[2] * b[3])
    if previous is not None:
        near = [b for b in faces if abs(b[0] + b[2] / 2 - previous) < 0.15 and b[2] * b[3] >= 0.6 * pick[2] * pick[3]]
        if near:
            pick = max(near, key=lambda b: b[2] * b[3])
    return pick[0] + pick[2] / 2


def follow(faces: dict, start: float, end: float) -> list | None:
    """The window's centre as keys [[t, centre], ...] (t from `start`) following the face through
    [start, end], or None when too few samples show one."""
    window = share(faces.get("width"), faces.get("height"))
    origin = faces.get("from", 0)
    samples = [
        (origin + t - start, boxes)
        for t, boxes in faces.get("samples") or []
        if start - 0.01 <= origin + t <= end + 0.01
    ]
    if not samples:
        return None
    centres, previous = [], None
    for _t, boxes in samples:
        centre = _centre(boxes, previous)
        centres.append(centre)
        previous = centre if centre is not None else previous
    seen = [c for c in centres if c is not None]
    if len(seen) < MIN_SEEN * len(centres):
        return None
    filled, last = [], seen[0]  # a sample without a face keeps the last one seen
    for centre in centres:
        last = centre if centre is not None else last
        filled.append(last)
    # a median over five samples drops a stray detection
    smooth = [
        sorted(filled[max(0, i - 2) : i + 3])[len(filled[max(0, i - 2) : i + 3]) // 2] for i in range(len(filled))
    ]
    low, high = window / 2, 1 - window / 2

    def inside(c):
        return min(high, max(low, c))

    current, busy = inside(smooth[0]), 0.0
    keys = [[0.0, round(current, 4)]]
    for (t, _boxes), centre in zip(samples, smooth, strict=True):
        target = inside(centre)
        if t < busy or abs(target - current) <= DEAD_ZONE * window:
            continue
        at = round(max(t, 0.0), 3)
        keys += [[at, round(current, 4)], [round(at + PAN, 3), round(target, 4)]]
        current, busy = target, at + PAN
    return keys


def frame_of(reel) -> dict:
    """{"layout": "crop" | "fit", "keys": [[t, centre], ...], "share": the window's width share}."""
    faces = reel.faces or {}
    window = share(faces.get("width"), faces.get("height"))
    middle = {"layout": "crop", "keys": [[0.0, 0.5]], "share": window}
    if reel.layout == "fit":
        return {"layout": "fit", "keys": [], "share": window}
    if reel.layout == "center" or window >= 0.999:
        return middle
    if faces.get("samples") is None:  # not scanned yet (or the video service is off)
        return middle
    keys = follow(faces, reel.start, reel.end)
    if keys is None:  # slides, a screen, or nobody in frame: all of it
        return {"layout": "fit", "keys": [], "share": window}
    return {"layout": "crop", "keys": keys, "share": window}
