"""The fonts a reel is drawn in: the captions' (a heavy sans for the bold style, else the look's own) and the
title's (the look's display font). The video service draws them with libass, which reads TrueType; Google
Fonts serves an old browser exactly that, so a font's file is looked up there and kept a month.
"""

import re
import struct
from urllib.parse import quote_plus

import requests
from django.core.cache import cache

BOLD = ("Montserrat", 800)  # the reels look: what the bold style's captions are in, whatever the look
_CSS = "https://fonts.googleapis.com/css2?family={family}{weight}"
_TTF = re.compile(r"url\((https://fonts\.gstatic\.com/[^)\s]+\.ttf)\)")
_OLD_BROWSER = {"User-Agent": "Mozilla/4.0"}  # (a modern one gets WOFF2, which libass can't read)
KEEP = 30 * 86400
RATIO = 1.22  # a typical font's line over its em, when the file can't be read


def roles(style: str, look_fonts: dict) -> dict:
    """{role: (family, weight)} for the captions and the title."""
    display = look_fonts.get("display") or BOLD[0]
    body = look_fonts.get("body") or display
    caption = {"clean": (body, 700), "brand": (display, 700)}.get(style, BOLD)
    return {"caption": caption, "title": (display, 700)}


def ttf(family: str, weight: int) -> str:
    """A TrueType file of `family` at `weight`, or at the nearest weight it has; "" when Google has none
    (the video service then draws in its own font). A failed lookup is not kept: the next render asks again."""
    key = f"reels:font:{quote_plus(family)}:{weight}"
    found = cache.get(key)
    if found is not None:
        return found
    url = ""
    for wanted in dict.fromkeys((weight, 700, 600, 400, None)):
        try:
            res = requests.get(
                _CSS.format(family=quote_plus(family), weight=f":wght@{wanted}" if wanted else ""),
                headers=_OLD_BROWSER,
                timeout=10,
            )
        except requests.RequestException:
            return ""
        match = _TTF.search(res.text) if res.status_code == 200 else None
        if match:
            url = match.group(1)
            break
    cache.set(key, url, KEEP)
    return url


def files(style: str, look_fonts: dict) -> dict:
    """{role: TrueType url} for the video service."""
    return {role: ttf(family, weight) for role, (family, weight) in roles(style, look_fonts).items()}


def win_ratio(data: bytes) -> float:
    """A TrueType file's line as libass sizes it, over its em: (usWinAscent + usWinDescent) / unitsPerEm
    (libass takes the OS/2 table's Windows metrics, as VSFilter did)."""
    count = struct.unpack(">H", data[4:6])[0]
    tables = {}
    for i in range(count):
        tag, _checksum, offset, _length = struct.unpack(">4sIII", data[12 + 16 * i : 28 + 16 * i])
        tables[tag] = offset
    head, os2 = tables[b"head"], tables[b"OS/2"]
    em = struct.unpack(">H", data[head + 18 : head + 20])[0]
    ascent, descent = struct.unpack(">HH", data[os2 + 74 : os2 + 78])
    return round((ascent + descent) / em, 3)


def line_ratio(url: str) -> float:
    """How tall libass draws the font for its size, over its em (win_ratio). The editor's preview divides by
    it to set the same text in CSS, which sizes by the em."""
    if not url:
        return RATIO
    key = f"reels:font-ratio:{url}"
    found = cache.get(key)
    if found is not None:
        return found
    try:
        res = requests.get(url, timeout=15)
        res.raise_for_status()
        ratio = win_ratio(res.content)
    except (requests.RequestException, struct.error, KeyError, ZeroDivisionError):
        return RATIO  # the preview then sets the text a little off, nothing worse
    cache.set(key, ratio, KEEP)
    return ratio
