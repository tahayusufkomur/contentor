"""logo_vector: colour trace -> role-snapped paths, icon crop, margin."""

import io
import re
from pathlib import Path

from PIL import Image, ImageDraw

from apps.tenant_config import logo_vector
from apps.tenant_config.logo_recipe import _PATH_D_RE

FIX = Path(__file__).parent / "fixtures" / "logo_gen"
TERMINAL = {
    "background": "#0f1a14",
    "surface": "#171f1a",
    "primary": "#4ade80",
    "accent": "#e2b53a",
    "ink": "#dff5e6",
    "muted": "#9fb3a6",
}
YOGA = {
    "background": "#ffffff",
    "surface": "#f3f3f3",
    "primary": "#2b2b2b",
    "accent": "#d9731a",
    "ink": "#2b2b2b",
    "muted": "#777777",
}


def _synthetic(bg="#ffffff", ink="#222222", accent="#d9731a"):
    """A 400x300 'logo': an accent disc on the left, an ink bar (the 'name') on the right, a clear gap between."""
    im = Image.new("RGB", (400, 300), bg)
    d = ImageDraw.Draw(im)
    d.ellipse((40, 100, 140, 200), fill=accent)
    d.rectangle((200, 130, 360, 170), fill=ink)
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def test_vectorize_snaps_roles_and_drops_the_background():
    mark = logo_vector.vectorize(_synthetic(), YOGA)
    roles = {p["role"] for p in mark["paths"]}
    assert roles <= {"accent", "ink", "primary", "muted", "surface"} and "background" not in roles
    assert "accent" in roles and ("ink" in roles or "primary" in roles)
    assert mark["view_box"][0] == 100 and 0 < mark["view_box"][1] < 100


def test_vectorize_paths_pass_the_recipe_whitelist_and_fold_translate():
    mark = logo_vector.vectorize(_synthetic(), YOGA)
    for p in mark["paths"]:
        assert _PATH_D_RE.match(p["d"]), p["d"][:40]
        assert not re.search(r"\d\.\d{3}", p["d"])  # <= 2 decimals
        assert "transform" not in p
    xs = [float(v) for p in mark["paths"] for v in re.findall(r"-?\d+(?:\.\d+)?", p["d"])[0::2]]
    assert min(xs) >= 1.5 and max(xs) <= 98.5  # fitted into the box with margin


def test_vectorize_rejects_over_cap(monkeypatch):
    monkeypatch.setattr(logo_vector, "MAX_PATHS", 1)
    assert logo_vector.vectorize(_synthetic(), YOGA) is None


def test_vectorize_real_logo_fixture_stays_within_caps():
    mark = logo_vector.vectorize((FIX / "terminal.png").read_bytes(), TERMINAL)
    assert mark is not None
    assert len(mark["paths"]) <= logo_vector.MAX_PATHS
    assert sum(len(p["d"]) for p in mark["paths"]) <= logo_vector.MAX_TOTAL_CHARS
    assert {p["role"] for p in mark["paths"]} >= {"primary", "ink"}


def test_icon_crop_returns_the_left_cluster_as_a_square():
    icon = logo_vector.icon_crop(_synthetic(), YOGA)
    im = Image.open(io.BytesIO(icon))
    assert im.size == (512, 512)
    # the disc (accent) is inside, the bar (ink) is not
    px = im.convert("RGB")
    colours = {px.getpixel((x, y)) for x in range(0, 512, 16) for y in range(0, 512, 16)}
    assert any(abs(c[0] - 0xD9) < 12 and abs(c[2] - 0x1A) < 12 for c in colours)
    assert not any(c == (0x22, 0x22, 0x22) for c in colours)


def test_icon_crop_is_none_for_a_wordmark():
    assert logo_vector.icon_crop((FIX / "wordmark.png").read_bytes(), YOGA) is None


def test_icon_crop_real_mark_name_logo():
    assert logo_vector.icon_crop((FIX / "yoga.png").read_bytes(), YOGA) is not None


def test_ink_margin():
    assert logo_vector.ink_margin(_synthetic(), "#ffffff") >= 0.13  # 40 px of 300
    full = Image.new("RGB", (100, 100), "#000000")
    b = io.BytesIO()
    full.save(b, "PNG")
    assert logo_vector.ink_margin(b.getvalue(), "#ffffff") == 0.0
