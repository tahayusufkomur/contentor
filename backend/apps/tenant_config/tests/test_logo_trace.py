"""trace_mark: quantize -> vtracer -> rescale -> role mapping. All fixture
PNGs are drawn with Pillow at test time — deterministic, no network, no
binary fixtures."""

import io
import re

from PIL import Image, ImageDraw

from apps.tenant_config import logo_trace
from apps.tenant_config.logo_recipe import MARK_CUSTOM_MAX_D_LEN, MARK_CUSTOM_MAX_PATHS


def _png(image):
    buf = io.BytesIO()
    image.save(buf, "PNG")
    return buf.getvalue()


def _three_color_mark():
    """Teal disc (largest) + orange diamond + near-black dot on white."""
    image = Image.new("RGB", (1024, 1024), "white")
    draw = ImageDraw.Draw(image)
    draw.ellipse([212, 212, 812, 812], fill=(15, 118, 110))
    draw.polygon([(512, 300), (700, 512), (512, 724), (400, 512)], fill=(245, 158, 11))
    draw.ellipse([480, 480, 544, 544], fill=(17, 24, 39))
    return _png(image)


def _numbers(d):
    return [float(n) for n in re.findall(r"-?\d+\.?\d*", d)]


def test_flat_mark_traces_within_caps_and_viewbox():
    paths = logo_trace.trace_mark(_three_color_mark())
    assert paths is not None
    assert 1 <= len(paths) <= MARK_CUSTOM_MAX_PATHS
    for path in paths:
        assert len(path["d"]) <= MARK_CUSTOM_MAX_D_LEN
        assert set(re.findall(r"[A-Za-z]", path["d"])) <= set("MLCQZ")
        nums = _numbers(path["d"])
        assert min(nums) >= 0 and max(nums) <= 100


def test_white_background_dropped_and_roles_ranked_by_area():
    paths = logo_trace.trace_mark(_three_color_mark())
    roles = [path["fill"] for path in paths]
    assert set(roles) <= {"mark", "mark2", "accent"}
    # Largest color (teal disc) must be "mark"; the tiny dot must be "accent".
    assert roles[0] == "mark"
    assert "accent" in roles
    # Nothing may keep a raw hex fill (the white background must be gone).
    assert all(not path["fill"].startswith("#") for path in paths)


def test_two_color_mark_uses_mark_and_mark2():
    image = Image.new("RGB", (1024, 1024), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle([200, 200, 824, 824], fill=(15, 118, 110))
    draw.ellipse([400, 400, 624, 624], fill=(245, 158, 11))
    paths = logo_trace.trace_mark(_png(image))
    assert {path["fill"] for path in paths} == {"mark", "mark2"}


def test_blank_white_image_rejected():
    assert logo_trace.trace_mark(_png(Image.new("RGB", (1024, 1024), "white"))) is None


def test_image_without_white_background_rejected():
    assert logo_trace.trace_mark(_png(Image.new("RGB", (1024, 1024), (15, 118, 110)))) is None


def test_pathological_complexity_rejected():
    """A 10x10 grid of discs traces to far more than 8 paths at every
    settings tier -> reject, caller falls back to authored paths."""
    image = Image.new("RGB", (1024, 1024), "white")
    draw = ImageDraw.Draw(image)
    colors = [(15, 118, 110), (245, 158, 11), (17, 24, 39)]
    for row in range(10):
        for col in range(10):
            x, y = 80 + col * 90, 80 + row * 90
            draw.ellipse([x, y, x + 48, y + 48], fill=colors[(row + col) % 3])
    assert logo_trace.trace_mark(_png(image)) is None


def test_garbage_bytes_rejected():
    assert logo_trace.trace_mark(b"not a png at all") is None
