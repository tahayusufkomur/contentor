"""Normalize a curated logo PNG for display on tenant sites: the source art
ships as a small mark centered on a huge opaque (near-)white canvas, which
renders as a white box on non-white navbars. Remove the background that is
connected to the border (enclosed white details stay), crop to the artwork,
and bound the size. A catalog mark whose background was only half cut away
(clear in places, its paper still opaque in others) gets the rest removed the
same way. Best effort like trace.py: anything unparseable comes back
unchanged, never raises."""

import io
import logging
from collections import deque

from PIL import Image, ImageChops, ImageFilter

logger = logging.getLogger(__name__)

MAX_SIZE = 1024  # longest edge of the stored PNG
PAD = 16  # transparent breathing room kept around the cropped mark
_WHITE_MIN = 240  # every RGB channel >= this reads as background (trace.py)
_CLEAR = 32  # alpha below this is already cut away
_PAPER_MIN = 225  # leftover paper is light, and often cream rather than white
_PAPER_NEAR = 14  # per channel, around the paper's own colour
_EDGE_INSET = 0.03  # of the side, in from the artwork's edge: a cut edge is ragged
_EDGE_SHARE = 0.8  # of one side still opaque paper: a background only half cut away


def _leftover_paper(im, px):
    """The paper colour of a half-removed background, or None. A mark that
    already has clear pixels is left alone unless one whole side of its
    artwork still runs along light, opaque paper: a light mark on a clear
    background (a white bird, a white disc) never fills a side like that."""
    width = im.width
    alpha = im.getchannel("A")
    if alpha.getextrema()[0] >= _CLEAR:
        return None  # no clear pixels: the opaque-canvas case, handled by _WHITE_MIN
    bbox = alpha.point(lambda a: 255 if a >= _CLEAR else 0).getbbox()
    if not bbox:
        return None
    left, top, right, bottom = bbox
    dx, dy = int((right - left) * _EDGE_INSET), int((bottom - top) * _EDGE_INSET)
    sides = (
        [px[(top + dy) * width + x] for x in range(left, right)],
        [px[(bottom - 1 - dy) * width + x] for x in range(left, right)],
        [px[y * width + left + dx] for y in range(top, bottom)],
        [px[y * width + right - 1 - dx] for y in range(top, bottom)],
    )
    paper = []
    for side in sides:
        light = [p[:3] for p in side if p[3] >= 200 and min(p[:3]) >= _PAPER_MIN]
        if len(light) >= _EDGE_SHARE * len(side):
            paper += light
    if not paper:
        return None
    return tuple(sorted(channel)[len(paper) // 2] for channel in zip(*paper, strict=True))


def _background_mask(im):
    """Flood fill from every background pixel on the border; returns the set
    of flat indexes that belong to the background, and whether it was a
    half-removed one. Background is near-white and opaque, or, for a
    half-removed background, clear or the leftover paper's colour (so the fill
    crosses what was already cut away)."""
    width, height = im.size
    px = list(im.getdata())
    paper = _leftover_paper(im, px)

    def is_bg(i):
        r, g, b, a = px[i]
        if paper is not None:
            return a < _CLEAR or all(abs(c - k) <= _PAPER_NEAR for c, k in zip((r, g, b), paper, strict=True))
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
    return mask, paper is not None


def clean_curated_png(data, fmt="PNG"):
    """The cleaned image as `fmt` bytes (PNG; WEBP for a catalog mark kept
    under its .webp key)."""
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

        mask, half_cut = _background_mask(im)
        if mask:
            px = list(im.getdata())
            for i in mask:
                px[i] = (255, 255, 255, 0)
            im.putdata(px)
        if half_cut:
            # The botched cut also leaves stray dots of paper: keep only what
            # sits within a few pixels of solid artwork.
            alpha = im.getchannel("A")
            solid = alpha.point(lambda a: 255 if a >= 128 else 0).filter(ImageFilter.MinFilter(3))
            im.putalpha(ImageChops.darker(alpha, solid.filter(ImageFilter.MaxFilter(7))))

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
        im.save(buf, fmt, **({"optimize": True} if fmt == "PNG" else {"quality": 92}))
        return buf.getvalue()
    except Exception:
        logger.warning("curated logo clean failed, keeping original", exc_info=True)
        return data
