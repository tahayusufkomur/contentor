"""oklch() -> sRGB hex for the style manifest palettes (pure math, no deps)."""

import math
import re

_NUM = re.compile(r"[\d.]+")


def _gamma(c):
    c = max(0.0, min(1.0, c))
    return 1.055 * c ** (1 / 2.4) - 0.055 if c > 0.0031308 else 12.92 * c


def oklch_to_hex(value):
    """'oklch(L C H)' (L 0..1, C, H degrees) -> '#rrggbb', channels clamped."""
    lightness, chroma, hue = (float(v) for v in _NUM.findall(value)[:3])
    a, b = chroma * math.cos(math.radians(hue)), chroma * math.sin(math.radians(hue))
    lc = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    mc = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    sc = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc
    g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc
    bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc
    return "#" + "".join(f"{round(_gamma(c) * 255):02x}" for c in (r, g, bl))
