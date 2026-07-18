"""clean_curated_png: white-background removal + content crop for curated
library PNGs (the seeded marks ship on opaque white canvases with huge
margins; tenant navbars are not white)."""

import io

import pytest
from PIL import Image

from apps.core.curated_logos.clean import MAX_SIZE, clean_curated_png


def _png(im):
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def _open(data):
    return Image.open(io.BytesIO(data)).convert("RGBA")


def _blob_on_white(size=(400, 200), blob=(150, 60, 250, 140), bg=(255, 255, 255)):
    im = Image.new("RGB", size, bg)
    for x in range(blob[0], blob[2]):
        for y in range(blob[1], blob[3]):
            im.putpixel((x, y), (200, 30, 30))
    return im


class TestBackgroundRemoval:
    def test_border_white_becomes_transparent_and_blob_stays(self):
        out = _open(clean_curated_png(_png(_blob_on_white())))
        assert out.getpixel((0, 0))[3] == 0
        # The blob survives opaque somewhere in the cropped result.
        assert any(p[3] == 255 and p[0] > 150 for p in out.getdata())

    def test_off_white_background_also_removed(self):
        out = _open(clean_curated_png(_png(_blob_on_white(bg=(250, 250, 246)))))
        assert out.getpixel((0, 0))[3] == 0

    def test_enclosed_white_is_preserved(self):
        im = Image.new("RGB", (200, 200), "white")
        # Black ring: a filled square with a white 40x40 hole in the middle.
        for x in range(50, 150):
            for y in range(50, 150):
                im.putpixel((x, y), (0, 0, 0))
        for x in range(80, 120):
            for y in range(80, 120):
                im.putpixel((x, y), (255, 255, 255))
        out = _open(clean_curated_png(_png(im)))
        center = out.getpixel((out.width // 2, out.height // 2))
        assert center[:3] == (255, 255, 255) and center[3] == 255

    def test_crops_the_white_margin(self):
        original = _blob_on_white()
        out = _open(clean_curated_png(_png(original)))
        # Blob is 100x80 in a 400x200 canvas; the result should be close to
        # the blob, not the canvas.
        assert out.width < 150 and out.height < 130


class TestSafety:
    def test_unparseable_bytes_returned_unchanged(self):
        data = b"\x89PNG\r\n\x1a\n" + b"0" * 64
        assert clean_curated_png(data) == data

    def test_oversized_image_is_downscaled(self):
        im = _blob_on_white(size=(2800, 1500), blob=(0, 0, 2800, 1500), bg=(255, 255, 255))
        # Full-canvas blob: nothing to crop, so the bound comes from scaling.
        for x in range(2800):
            im.putpixel((x, 0), (10, 10, 10))
            im.putpixel((x, 1499), (10, 10, 10))
        out = _open(clean_curated_png(_png(im)))
        assert max(out.size) <= MAX_SIZE

    def test_idempotent_on_cleaned_output(self):
        once = clean_curated_png(_png(_blob_on_white()))
        twice = clean_curated_png(once)
        a, b = _open(once), _open(twice)
        assert abs(a.width - b.width) <= 2 and abs(a.height - b.height) <= 2
        assert b.getpixel((0, 0))[3] == 0

    def test_fully_transparent_input_survives(self):
        im = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        data = _png(im)
        # Nothing opaque at all -> best effort, must not crash or return empty.
        out = clean_curated_png(data)
        assert isinstance(out, bytes) and len(out) > 0


@pytest.mark.parametrize("mode", ["P", "L", "RGB"])
def test_non_rgba_modes_are_handled(mode):
    im = _blob_on_white().convert(mode)
    out = _open(clean_curated_png(_png(im)))
    assert out.getpixel((0, 0))[3] == 0
