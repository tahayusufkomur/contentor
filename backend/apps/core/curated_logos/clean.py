"""Normalize a curated logo PNG for display on tenant sites: the source art
ships as a small mark centered on a huge opaque (near-)white canvas, which
renders as a white box on non-white navbars. Remove the background that is
connected to the border (enclosed white details stay), crop to the artwork,
and bound the size. Best effort like trace.py: anything unparseable comes
back unchanged, never raises."""

import io
import logging
from collections import deque

from PIL import Image

logger = logging.getLogger(__name__)

MAX_SIZE = 1024  # longest edge of the stored PNG
PAD = 16  # transparent breathing room kept around the cropped mark
_WHITE_MIN = 240  # every RGB channel >= this reads as background (trace.py)


def _background_mask(im):
    """Flood fill from every near-white opaque border pixel; returns a set of
    flat indexes that belong to the background."""
    width, height = im.size
    px = list(im.getdata())

    def is_bg(i):
        r, g, b, a = px[i]
        return a > 0 and r >= _WHITE_MIN and g >= _WHITE_MIN and b >= _WHITE_MIN

    seen = bytearray(width * height)
    queue = deque()
    for x in range(width):
        for i in (x, (height - 1) * width + x):
            if not seen[i] and is_bg(i):
                seen[i] = 1
                queue.append(i)
    for y in range(height):
        for i in (y * width, y * width + width - 1):
            if not seen[i] and is_bg(i):
                seen[i] = 1
                queue.append(i)

    mask = set(queue)
    while queue:
        i = queue.popleft()
        x = i % width
        neighbors = []
        if x > 0:
            neighbors.append(i - 1)
        if x < width - 1:
            neighbors.append(i + 1)
        if i >= width:
            neighbors.append(i - width)
        if i < width * (height - 1):
            neighbors.append(i + width)
        for n in neighbors:
            if not seen[n] and is_bg(n):
                seen[n] = 1
                mask.add(n)
                queue.append(n)
    return mask


def clean_curated_png(data):
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
        im = im.convert("RGBA")
    except Exception:
        logger.warning("curated logo clean: unparseable image, keeping original", exc_info=True)
        return data
    try:
        if max(im.size) > MAX_SIZE:
            im.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)

        mask = _background_mask(im)
        if mask:
            px = list(im.getdata())
            for i in mask:
                px[i] = (255, 255, 255, 0)
            im.putdata(px)

        bbox = im.getbbox()  # None when everything is transparent
        if bbox:
            left, top, right, bottom = bbox
            im = im.crop(
                (
                    max(0, left - PAD),
                    max(0, top - PAD),
                    min(im.width, right + PAD),
                    min(im.height, bottom + PAD),
                )
            )

        buf = io.BytesIO()
        im.save(buf, "PNG", optimize=True)
        return buf.getvalue()
    except Exception:
        logger.warning("curated logo clean failed, keeping original", exc_info=True)
        return data
