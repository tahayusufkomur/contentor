# Logo Studio Image-Model Icon Marks (Generate → Vectorize) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Icon-stage Design-with-AI candidates get their marks drawn by Gemini image generation and vectorized back into the studio's `{d, fill: role}` path format, with per-candidate fail-open to Claude's authored paths.

**Architecture:** Two new backend modules — `logo_image.py` (Gemini REST, key-gated, parallel, cost-accounted) and `logo_trace.py` (Pillow quantize → vtracer → rescale to the 0–100 viewBox → role mapping) — wired into the icon stage of `logo_converse.py` via a new `image_prompt` field on `_IconDesign` and an `apply_image_marks()` post-step. The wizard UI and the two-pass critique flow are unchanged except one keep-rule in `critique_turn` so unchanged designs retain traced paths. Spec: `docs/superpowers/specs/2026-07-11-logo-image-mark-vectorize-design.md`.

**Tech Stack:** Django 5.1 backend, pytest (run inside the `django` container), `requests` (already a dep) for Gemini REST, new pip deps `vtracer` (Rust wheel) + `Pillow`.

## Global Constraints

- Repo root: `/Users/tahayusufkomur/ws/projects-active/home-server/contentor`. All `docker compose` / `make` commands run from there. The dev stack must be up (`make dev` in another shell if it isn't).
- Tests run inside the container: `docker compose exec django pytest <path> -v`. Full suite: `make test`. Lint: `make lint` (pre-commit must pass with zero issues).
- **Shared working tree:** other agents may move HEAD. Before every commit, run `git branch --show-current` and `git status` — expect branch `main`; if the branch or staged state looks foreign, STOP and ask rather than commit.
- `GEMINI_API_KEY` unset ⇒ feature entirely off; **no fake Gemini service anywhere** — tests mock at the module boundary (`logo_image.generate_mark_images`, `logo_trace.trace_mark`, or `requests.post`). Never make real network calls in tests.
- Traced output must fit the existing recipe caps verbatim: ≤ `MARK_CUSTOM_MAX_PATHS` (8) path entries, each `d` ≤ `MARK_CUSTOM_MAX_D_LEN` (2000 chars), coordinates inside the `0 0 100 100` viewBox. Do NOT raise any cap in `logo_recipe.py`.
- Every traced path re-enters the existing `validate_recipe` injection whitelist before reaching a client. Never bypass it.
- Path fill role tokens are `"mark" | "mark2" | "accent"` (`logo_recipe.MARK_FILL_ROLES`) — note the third is `accent`, NOT `mark_accent` (`mark_accent` exists only in `color_roles`).
- Never create new `.md` files. Never commit unless the step says to commit. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Icon stage only: `name` / `tagline` stages must never trigger image generation.

**Empirically verified facts about vtracer 0.6 (from a scratch venv — trust these over intuition):**
- API: `vtracer.convert_raw_image_to_svg(img_bytes, img_format="png", colormode=..., hierarchical=..., mode=..., filter_speckle=..., color_precision=..., layer_difference=..., corner_threshold=..., length_threshold=..., splice_threshold=..., path_precision=...)` → SVG string.
- Output paths look like `<path d="M0 0 C3.05 2.36 … Z " fill="#0F766E" transform="translate(711,287)"/>` — coordinates are **relative to the per-path `translate(tx,ty)` offset**; commands observed are `M`, `C`, `Z` (absolute only, spline mode); the **first path is the full-canvas background** (e.g. `fill="#FFFFFF"`).
- A simple 3-color 1024px mark traces to ~4 paths with `d` lengths 115–1840 chars at the settings below, and rescaling to 1-decimal 0–100 coordinates keeps `d` under the 2000 cap.

---

### Task 1: Gemini image provider (`logo_image.py`)

**Files:**
- Create: `backend/apps/tenant_config/logo_image.py`
- Create: `backend/apps/tenant_config/tests/test_logo_image.py`
- Modify: `backend/config/settings/base.py` (after the `LOGO_AI_MONTHLY_REFINE_LIMIT` line, ~line 247)
- Modify: `.env.prod.example` (in the AI block near `ANTHROPIC_API_KEY=`, ~line 106)

**Interfaces:**
- Consumes: `settings.GEMINI_API_KEY`, `settings.LOGO_IMAGE_MODEL` (added here).
- Produces (Task 3 relies on these exact signatures):
  - `logo_image.enabled() -> bool`
  - `logo_image.generate_mark_images(prompts: list[str]) -> tuple[list[bytes | None], Decimal]` — one PNG-bytes-or-`None` per prompt, position-aligned; summed attempt cost in USD. Never raises.

- [ ] **Step 1: Add settings**

In `backend/config/settings/base.py`, directly after the `LOGO_AI_MONTHLY_REFINE_LIMIT` assignment:

```python
# --- Logo Studio image-model icon marks (generate -> vectorize) ---
# Unset key = feature entirely off: the icon stage ships Claude-authored
# paths exactly as before (mirrors the ANTHROPIC_API_KEY-unset pattern, so
# tests/CI/e2e need no fake service). NOT routed through AI_PROVIDER — image
# generation is a different modality with its own key and off-switch.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
LOGO_IMAGE_MODEL = os.environ.get("LOGO_IMAGE_MODEL", "gemini-3.5-flash-image")
```

In `.env.prod.example`, under the existing AI section next to `ANTHROPIC_API_KEY=`:

```bash
# Logo Studio image-model icon marks (Gemini; unset = feature off)
GEMINI_API_KEY=
```

- [ ] **Step 2: Write the failing tests**

Create `backend/apps/tenant_config/tests/test_logo_image.py`:

```python
"""Gemini image provider: key gating, parallel fan-out order, per-slot
failure isolation, and usage-metadata cost math. requests is always
monkeypatched — no network access."""

from decimal import Decimal

import pytest
import requests

from apps.tenant_config import logo_image


class _FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self._status = status

    def raise_for_status(self):
        if self._status >= 400:
            raise requests.HTTPError(f"status {self._status}")

    def json(self):
        return self._payload


def _image_payload(b64_data="cG5nLWJ5dGVz", prompt_tokens=20, output_tokens=2240):
    return {
        "candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": b64_data}}]}}],
        "usageMetadata": {"promptTokenCount": prompt_tokens, "candidatesTokenCount": output_tokens},
    }


def test_enabled_requires_key(settings):
    settings.GEMINI_API_KEY = ""
    assert logo_image.enabled() is False
    settings.GEMINI_API_KEY = "test-key"
    assert logo_image.enabled() is True


def test_generate_returns_images_in_order_with_summed_cost(settings, monkeypatch):
    settings.GEMINI_API_KEY = "test-key"
    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(json["contents"][0]["parts"][0]["text"])
        return _FakeResponse(_image_payload())

    monkeypatch.setattr(logo_image.requests, "post", fake_post)
    images, cost = logo_image.generate_mark_images(["a leaf", "a wave"])
    assert len(images) == 2
    assert all(img == b"png-bytes" for img in images)
    assert sorted(calls) == ["a leaf", "a wave"]
    # 2 * (20 in * 0.0000003 + 2240 out * 0.00003)
    assert cost == Decimal("0.000006") * 2 + Decimal("0.0672") * 2


def test_generate_isolates_per_slot_failure(settings, monkeypatch):
    settings.GEMINI_API_KEY = "test-key"

    def fake_post(url, headers=None, json=None, timeout=None):
        if "boom" in json["contents"][0]["parts"][0]["text"]:
            raise requests.ConnectionError("down")
        return _FakeResponse(_image_payload())

    monkeypatch.setattr(logo_image.requests, "post", fake_post)
    images, cost = logo_image.generate_mark_images(["boom", "a wave"])
    assert images[0] is None
    assert images[1] == b"png-bytes"
    assert cost > 0  # the successful call still billed


def test_generate_http_error_yields_none(settings, monkeypatch):
    settings.GEMINI_API_KEY = "test-key"
    monkeypatch.setattr(logo_image.requests, "post", lambda *a, **k: _FakeResponse({}, status=500))
    images, cost = logo_image.generate_mark_images(["a leaf"])
    assert images == [None]
    assert cost == Decimal("0")


def test_garbled_usage_metadata_falls_back_to_flat_cost(settings, monkeypatch):
    settings.GEMINI_API_KEY = "test-key"
    payload = _image_payload()
    payload["usageMetadata"] = {"promptTokenCount": "not-a-number"}
    monkeypatch.setattr(logo_image.requests, "post", lambda *a, **k: _FakeResponse(payload))
    images, cost = logo_image.generate_mark_images(["a leaf"])
    assert images == [b"png-bytes"]
    assert cost == Decimal("0.067")


def test_response_without_image_part_yields_none_but_bills(settings, monkeypatch):
    settings.GEMINI_API_KEY = "test-key"
    payload = {
        "candidates": [{"content": {"parts": [{"text": "cannot draw that"}]}}],
        "usageMetadata": {"promptTokenCount": 20, "candidatesTokenCount": 10},
    }
    monkeypatch.setattr(logo_image.requests, "post", lambda *a, **k: _FakeResponse(payload))
    images, cost = logo_image.generate_mark_images(["a leaf"])
    assert images == [None]
    assert cost > 0


def test_empty_prompt_list(settings):
    settings.GEMINI_API_KEY = "test-key"
    assert logo_image.generate_mark_images([]) == ([], Decimal("0"))
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_image.py -v`
Expected: FAIL / ERROR with `ModuleNotFoundError: No module named 'apps.tenant_config.logo_image'` (settings restart note: if `GEMINI_API_KEY` isn't recognized, the django container needs a restart to pick up base.py — `docker compose restart django`).

- [ ] **Step 4: Write the module**

Create `backend/apps/tenant_config/logo_image.py`:

```python
"""Gemini image generation for Logo Studio icon marks (generate -> vectorize;
see docs/superpowers/specs/2026-07-11-logo-image-mark-vectorize-design.md).

GEMINI_API_KEY unset = feature entirely off (the icon stage ships
Claude-authored paths as before). Deliberately not routed through
core_ai/AI_PROVIDER: that switch selects who runs Claude-shaped structured
calls; image generation is a different modality with its own key."""

import base64
import logging
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_TIMEOUT_SECONDS = 60
_MAX_PARALLEL = 3

# Google price-page rates, USD per token; re-check https://ai.google.dev/pricing
# when bumping LOGO_IMAGE_MODEL. A 1K image bills ~2240 output tokens ~= $0.067.
_USD_PER_INPUT_TOKEN = Decimal("0.0000003")  # $0.30 / 1M
_USD_PER_OUTPUT_TOKEN = Decimal("0.00003")  # $30 / 1M
_FLAT_IMAGE_USD = Decimal("0.067")  # fallback when usageMetadata is absent/garbled


def enabled():
    return bool(settings.GEMINI_API_KEY)


def _cost(payload):
    try:
        usage = payload["usageMetadata"]
        cost = Decimal(int(usage.get("promptTokenCount", 0))) * _USD_PER_INPUT_TOKEN + Decimal(
            int(usage.get("candidatesTokenCount", 0))
        ) * _USD_PER_OUTPUT_TOKEN
        return cost if cost > 0 else _FLAT_IMAGE_USD
    except (KeyError, TypeError, ValueError):
        return _FLAT_IMAGE_USD


def _generate_one(prompt):
    """One prompt -> (png_bytes | None, billed attempt cost). Never raises."""
    try:
        response = requests.post(
            _ENDPOINT.format(model=settings.LOGO_IMAGE_MODEL),
            headers={"x-goog-api-key": settings.GEMINI_API_KEY},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseModalities": ["IMAGE"],
                    "imageConfig": {"aspectRatio": "1:1", "imageSize": "1K"},
                },
            },
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        for part in payload["candidates"][0]["content"]["parts"]:
            data = (part.get("inlineData") or {}).get("data")
            if data:
                return base64.b64decode(data), _cost(payload)
        logger.warning("logo image: response contained no inline image data")
        return None, _cost(payload)
    except Exception:
        logger.exception("logo image: generation call failed")
        return None, Decimal("0")


def generate_mark_images(prompts):
    """prompts -> (images, cost_usd). One PNG-bytes-or-None per prompt,
    position-aligned, generated in parallel; cost is the summed spend of all
    attempts (the caller records it against the budget kill-switch)."""
    if not prompts:
        return [], Decimal("0")
    with ThreadPoolExecutor(max_workers=min(_MAX_PARALLEL, len(prompts))) as pool:
        results = list(pool.map(_generate_one, prompts))
    return [image for image, _ in results], sum((cost for _, cost in results), Decimal("0"))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_image.py -v`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # expect: main — STOP if not
git add backend/apps/tenant_config/logo_image.py backend/apps/tenant_config/tests/test_logo_image.py backend/config/settings/base.py .env.prod.example
git commit -m "feat(logo-v2): Gemini image provider for icon marks (key-gated, cost-accounted)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Tracer (`logo_trace.py`) + vtracer/Pillow deps

**Files:**
- Modify: `backend/requirements/base.txt`
- Create: `backend/apps/tenant_config/logo_trace.py`
- Create: `backend/apps/tenant_config/tests/test_logo_trace.py`

**Interfaces:**
- Consumes: nothing from other tasks (constants mirror `logo_recipe.MARK_CUSTOM_MAX_PATHS` / `MARK_CUSTOM_MAX_D_LEN` as local copies, same pattern as `logo_geometry._MAX_D`).
- Produces (Task 3 relies on this exact signature):
  - `logo_trace.trace_mark(png_bytes: bytes) -> list[dict] | None` — path dicts `{"d": str, "fill": "mark"|"mark2"|"accent"}` in vtracer stacking order, coordinates inside `0 0 100 100`, ≤8 entries, each `d` ≤2000 chars; `None` when the image can't produce a clean mark. Never raises.

- [ ] **Step 1: Add deps and rebuild the django image**

Append to `backend/requirements/base.txt`:

```
vtracer>=0.6,<1.0
Pillow>=10.4,<12
```

Run: `docker compose build django && docker compose up -d django celery-worker celery-beat`
Expected: image builds cleanly (both are pure wheels on python:3.12 — no system packages). Verify: `docker compose exec django python -c "import vtracer, PIL; print(vtracer.__name__, PIL.__version__)"` prints `vtracer <version>`.
(Gunicorn `--reload` reloads code only, not newly installed deps — the rebuild is required before the tests can even import.)

- [ ] **Step 2: Write the failing tests**

Create `backend/apps/tenant_config/tests/test_logo_trace.py`. Fixture PNGs are generated in-test with Pillow (deterministic, no binaries in git):

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_trace.py -v`
Expected: ERROR with `ModuleNotFoundError: No module named 'apps.tenant_config.logo_trace'`.

- [ ] **Step 4: Write the module**

Create `backend/apps/tenant_config/logo_trace.py`:

```python
"""Vectorize a generated raster mark back into Logo Studio path dicts.

trace_mark(png_bytes) -> [{"d", "fill": "mark"|"mark2"|"accent"}, ...] | None

Pipeline: Pillow flatten+quantize (<=3 colors on a white background) ->
vtracer (flat-mark settings, one coarser retry) -> drop background paths ->
rescale pixel coordinates into the 0 0 100 100 mark viewBox -> map quantized
colors to fill roles by area (largest = "mark"). The result is CANDIDATE
input to validate_recipe's injection whitelist (the caller re-validates) —
never trusted output. Caps mirror logo_recipe.MARK_CUSTOM_* (local copies,
same pattern as logo_geometry._MAX_D). Returns None on anything
pathological; the caller falls back to Claude-authored paths."""

import io
import logging
import re

import vtracer
from PIL import Image

logger = logging.getLogger(__name__)

_MAX_PATHS = 8  # logo_recipe.MARK_CUSTOM_MAX_PATHS
_MAX_D_LEN = 2000  # logo_recipe.MARK_CUSTOM_MAX_D_LEN
_MARGIN = 4.0  # breathing room inside the 0-100 viewBox
_WHITE_MIN = 240  # every RGB channel >= this reads as background
_MAX_TRACE_SIZE = 1024
_ROLE_ORDER = ("mark", "mark2", "accent")

# vtracer emits `<path d="..." fill="#RRGGBB" transform="translate(x,y)"/>`
# with coordinates RELATIVE to the translate offset; the first path is the
# full-canvas background. Commands are absolute M/L/C/Z (spline mode).
_SVG_PATH_RE = re.compile(
    r'<path d="([^"]+)" fill="#([0-9A-Fa-f]{6})"(?: transform="translate\(([-0-9.]+),([-0-9.]+)\)")?'
)
_D_TOKEN_RE = re.compile(r"([A-Za-z])|(-?\d*\.?\d+)")
_ALLOWED_COMMANDS = set("MLCQZ")

# Flat-mark settings; the second, coarser tier is the one retry before reject.
_VTRACER_TIERS = (
    dict(filter_speckle=16, color_precision=6, layer_difference=64, corner_threshold=80,
         length_threshold=6.0, splice_threshold=60, path_precision=1),
    dict(filter_speckle=32, color_precision=6, layer_difference=64, corner_threshold=110,
         length_threshold=12.0, splice_threshold=80, path_precision=0),
)


def _prepare(png_bytes):
    """Flatten alpha onto white, cap size, quantize. Returns
    (quantized_png_bytes, size, [(count, rgb), ...] non-background colors,
    ranked by area) or None when the image can't be a clean mark."""
    try:
        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    except Exception:
        return None
    base = Image.new("RGBA", image.size, (255, 255, 255, 255))
    image = Image.alpha_composite(base, image).convert("RGB")
    image.thumbnail((_MAX_TRACE_SIZE, _MAX_TRACE_SIZE))
    quantized = image.quantize(colors=4, method=Image.Quantize.MEDIANCUT).convert("RGB")
    colors = quantized.getcolors(16) or []
    background = [c for c in colors if all(channel >= _WHITE_MIN for channel in c[1])]
    foreground = sorted(
        (c for c in colors if not all(channel >= _WHITE_MIN for channel in c[1])), reverse=True
    )
    # The image prompt demands a white background; no white (or no shapes)
    # means the model ignored it — not a traceable mark.
    if not background or not foreground or len(foreground) > len(_ROLE_ORDER):
        return None
    buf = io.BytesIO()
    quantized.save(buf, "PNG")
    return buf.getvalue(), quantized.size, foreground


def _nearest(rgb, candidates):
    return min(candidates, key=lambda c: sum((a - b) ** 2 for a, b in zip(rgb, c)))


def _rescale_d(d, tx, ty, size):
    """Absolute pixel-space path data (+ translate offset) -> 0-100 viewBox
    with margin, 1 decimal place. Returns None on any non-absolute or exotic
    command — coarser retry / rejection beats silently wrong geometry."""
    scale = (100.0 - 2 * _MARGIN) / max(size)
    out, is_x = [], True
    for letter, number in _D_TOKEN_RE.findall(d):
        if letter:
            if letter not in _ALLOWED_COMMANDS:
                return None
            out.append(letter)
            is_x = True
        else:
            value = (float(number) + (tx if is_x else ty)) * scale + _MARGIN
            if not 0.0 <= value <= 100.0:
                value = min(max(value, 0.0), 100.0)
            out.append(f"{value:.1f}")
            is_x = not is_x
    return " ".join(out)


def _trace_once(quantized_png, size, roles_by_rgb, tier):
    svg = vtracer.convert_raw_image_to_svg(
        quantized_png, img_format="png", colormode="color", hierarchical="stacked",
        mode="spline", **tier
    )
    paths = []
    for d, hex_color, tx, ty in _SVG_PATH_RE.findall(svg):
        rgb = tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))
        if all(channel >= _WHITE_MIN for channel in rgb):
            continue  # background layer
        role = roles_by_rgb[_nearest(rgb, list(roles_by_rgb))]
        rescaled = _rescale_d(d.strip(), float(tx or 0), float(ty or 0), size)
        if rescaled is None or len(rescaled) > _MAX_D_LEN:
            return None
        paths.append({"d": rescaled, "fill": role})
        if len(paths) > _MAX_PATHS:
            return None
    return paths or None


def trace_mark(png_bytes):
    prepared = _prepare(png_bytes)
    if not prepared:
        return None
    quantized_png, size, foreground = prepared
    roles_by_rgb = {rgb: role for (_, rgb), role in zip(foreground, _ROLE_ORDER)}
    for tier in _VTRACER_TIERS:
        try:
            paths = _trace_once(quantized_png, size, roles_by_rgb, tier)
        except Exception:
            logger.exception("logo trace: vtracer failed")
            return None
        if paths:
            return paths
    logger.info("logo trace: no tier produced a mark within caps — rejecting")
    return None
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_trace.py -v`
Expected: 7 passed. If `test_pathological_complexity_rejected` unexpectedly passes tracing (i.e. returns paths), the coarse tier swallowed the discs — shrink the disc size in the test from 48px to 40px, not the module caps.

- [ ] **Step 6: Run the neighboring logo suites to catch import fallout**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_recipe.py apps/tenant_config/tests/test_logo_geometry.py -q`
Expected: all pass, unchanged.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # expect: main — STOP if not
git add backend/requirements/base.txt backend/apps/tenant_config/logo_trace.py backend/apps/tenant_config/tests/test_logo_trace.py
git commit -m "feat(logo-v2): raster-to-paths mark tracer (vtracer + Pillow)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Icon-stage wiring (image_prompt → generate → trace → swap paths)

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py` (add `_validate_custom_paths` next to `_validate_pack_mark`, ~line 486)
- Modify: `backend/apps/tenant_config/logo_converse.py` (`_IconDesign`, `ICON_STAGE_PROMPT`, `_validate_icon_design`, new `apply_image_marks`, `converse_turn`)
- Modify: `backend/apps/tenant_config/tests/test_logo_converse.py`
- Modify: `backend/apps/tenant_config/tests/test_logo_converse_views.py`

**Interfaces:**
- Consumes: `logo_image.enabled()`, `logo_image.generate_mark_images(prompts) -> (list[bytes|None], Decimal)` (Task 1); `logo_trace.trace_mark(png) -> list[dict] | None` (Task 2).
- Produces: icon-stage `TurnResult.designs[i]["paths"]` may be traced; `TurnResult.cost_usd` includes Gemini spend (so the view's existing `record_attempt_cost(result.cost_usd)` covers the kill-switch with **zero view changes for Pass A**); `image_prompt` never reaches the client. `logo_ai._validate_custom_paths(paths) -> list | None` (also used conceptually by Task 4's inherited paths — those are already validated).

- [ ] **Step 1: Write the failing unit tests**

Append to `backend/apps/tenant_config/tests/test_logo_converse.py` (reuse the module's existing `_ICON_TURN` dict and mocking style — `core_ai.structured` is monkeypatched, never called for real):

```python
# --- image-model icon marks (generate -> vectorize) -----------------------

_TRACED_PATHS = [{"d": "M 10.0 10.0 C 20.0 10.0 30.0 20.0 30.0 30.0 Z", "fill": "mark"}]


def _icon_turn_with_prompts():
    turn = {
        "message": _ICON_TURN["message"],
        "designs": [{**_ICON_TURN["designs"][0], "image_prompt": "flat vector leaf mark"}],
    }
    return turn


def _run_icon_turn(monkeypatch, parsed_dict, enabled=True, images=None, image_cost=None, traced="unset"):
    from decimal import Decimal as D

    from apps.tenant_config import logo_image, logo_trace

    parsed = logo_converse._IconTurn.model_validate(parsed_dict)
    monkeypatch.setattr(
        logo_converse.core_ai, "structured", lambda **kwargs: (parsed, D("0.02"), "claude-sonnet-5")
    )
    monkeypatch.setattr(logo_image, "enabled", lambda: enabled)
    calls = {}

    def fake_generate(prompts):
        calls["prompts"] = prompts
        return (images if images is not None else [b"png"] * len(prompts)), (image_cost or D("0.067"))

    monkeypatch.setattr(logo_image, "generate_mark_images", fake_generate)
    monkeypatch.setattr(
        logo_trace, "trace_mark", lambda png: _TRACED_PATHS if traced == "unset" else traced
    )
    result = logo_converse.converse_turn("icon", {}, [], {}, "hi")
    return result, calls


def test_icon_turn_swaps_in_traced_paths_and_adds_image_cost(monkeypatch):
    result, calls = _run_icon_turn(monkeypatch, _icon_turn_with_prompts())
    assert calls["prompts"] == ["flat vector leaf mark"]
    assert result.designs[0]["paths"] == _TRACED_PATHS
    assert result.cost_usd == Decimal("0.02") + Decimal("0.067")
    assert "image_prompt" not in result.designs[0]


def test_icon_turn_gemini_failure_falls_back_to_authored_paths(monkeypatch):
    plain = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), enabled=False)[0]
    result, _ = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), images=[None])
    assert result.designs[0]["paths"] == plain.designs[0]["paths"]  # authored compile
    assert result.cost_usd == Decimal("0.02") + Decimal("0.067")  # attempt still billed


def test_icon_turn_trace_rejection_falls_back(monkeypatch):
    plain = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), enabled=False)[0]
    result, _ = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), traced=None)
    assert result.designs[0]["paths"] == plain.designs[0]["paths"]


def test_icon_turn_invalid_traced_paths_fall_back(monkeypatch):
    plain = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), enabled=False)[0]
    hostile = [{"d": 'M0 0 url("x") Z', "fill": "mark"}]  # fails the injection whitelist
    result, _ = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), traced=hostile)
    assert result.designs[0]["paths"] == plain.designs[0]["paths"]


def test_icon_turn_key_unset_never_generates_and_strips_prompt(monkeypatch):
    result, calls = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), enabled=False)
    assert "prompts" not in calls
    assert result.cost_usd == Decimal("0.02")
    assert "image_prompt" not in result.designs[0]


def test_name_stage_never_generates_images(monkeypatch):
    from apps.tenant_config import logo_image

    parsed = logo_converse._LockupTurn.model_validate(_NAME_TURN)
    monkeypatch.setattr(
        logo_converse.core_ai, "structured", lambda **kwargs: (parsed, Decimal("0.02"), "m")
    )
    monkeypatch.setattr(logo_image, "enabled", lambda: True)
    monkeypatch.setattr(
        logo_image, "generate_mark_images", lambda prompts: pytest.fail("image gen on name stage")
    )
    logo_converse.converse_turn("name", {}, [], {}, "hi")
```

Append one integration-style view test to `backend/apps/tenant_config/tests/test_logo_converse_views.py`, inside `class TestConverse` (the file's fixtures are `coach_client` — an `APIClient` with `HTTP_HOST` baked in and the coach force-authenticated — plus `paid_tenant`; neighboring tests set `settings.AI_PROVIDER = "anthropic"` / `settings.ANTHROPIC_API_KEY = "k"` and use the module constants `URL`, `PAYLOAD`, `MONTH`, `SHARED_SCHEMA`):

```python
    def test_icon_turn_records_image_cost_in_logo_ai_usage(self, coach_client, paid_tenant, settings, monkeypatch):
        """End-to-end Pass A: real converse_turn + validators, mocked
        provider + Gemini. The recorded spend must include image cost (the
        kill-switch covers Gemini) and the response must carry traced paths."""
        from apps.tenant_config import logo_image, logo_trace

        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        parsed = logo_converse._IconTurn.model_validate(
            {
                "message": "Here.",
                "designs": [
                    {
                        "concept": "c",
                        "rationale": "r",
                        "image_prompt": "flat vector leaf mark",
                        "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 30}],
                        "palette": {
                            "name": "P",
                            "primary": "#0f766e",
                            "secondary": "#14b8a6",
                            "accent": "#f59e0b",
                            "ink": "#111827",
                        },
                        "color_roles": {"mark": "primary", "mark2": "secondary", "mark_accent": "accent"},
                    }
                ],
            }
        )
        monkeypatch.setattr(
            logo_converse.core_ai, "structured", lambda **kwargs: (parsed, Decimal("0.02"), "m")
        )
        monkeypatch.setattr(logo_image, "enabled", lambda: True)
        monkeypatch.setattr(
            logo_image, "generate_mark_images", lambda prompts: ([b"png"], Decimal("0.067"))
        )
        traced = [{"d": "M 10.0 10.0 C 20.0 10.0 30.0 20.0 30.0 30.0 Z", "fill": "mark"}]
        monkeypatch.setattr(logo_trace, "trace_mark", lambda png: traced)

        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.status_code == 200, resp.content
        assert resp.data["designs"][0]["paths"] == traced
        assert "image_prompt" not in resp.data["designs"][0]
        usage = LogoAiUsage.objects.get(tenant_schema=SHARED_SCHEMA, month=MONTH)
        assert usage.usd_spent == Decimal("0.087")
```

(`MONTH = "2026-07"` in this file is real-time — `logo_ai._current_month()` — which matches while implementing in July 2026; if the suite runs in a later month the whole file's neighboring tests break identically, so don't special-case it here.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_converse.py apps/tenant_config/tests/test_logo_converse_views.py -v -k "image or traced or generates"`
Expected: FAIL — `_IconTurn` rejects `image_prompt`? No: pydantic ignores unknown fields by default only if configured; expect either `ValidationError` (extra field) or assertions failing because `paths` are the compiled-circle paths and `cost_usd` lacks the image cost.

- [ ] **Step 3: Implement**

3a. In `backend/apps/tenant_config/logo_ai.py`, directly after `_validate_pack_mark` (~line 511):

```python
def _validate_custom_paths(paths):
    """Traced (already-path-form) mark geometry -> validated paths through
    the same validate_recipe injection whitelist as authored marks, or None.
    Tracing produces CANDIDATE input to the trust boundary, never trusted
    output."""
    dummy = {**_DUMMY_RECIPE, "mark": {"type": "custom", "rationale": "traced", "paths": paths}}
    shaped = validate_recipe(dummy)
    if shaped["mark"]["type"] != "custom":
        return None
    return shaped["mark"]["paths"]
```

3b. In `backend/apps/tenant_config/logo_converse.py`:

Add to the imports block:

```python
from decimal import Decimal

from . import logo_image, logo_trace
from .logo_ai import _validate_custom_paths
```

(`_validate_custom_paths` joins the existing `from .logo_ai import (...)` list alphabetically; `logo_image`/`logo_trace` module imports go with the other relative imports. Keep ruff happy.)

Extend `_IconDesign`:

```python
class _IconDesign(BaseModel):
    concept: str
    elements: list[_Element]
    rationale: str
    palette: _Palette
    color_roles: _MarkRoles
    image_prompt: str = ""
```

Extend `_validate_icon_design`'s returned dict with one entry (after `"color_roles": ...`):

```python
        "image_prompt": str(item.image_prompt or "")[:500],
```

Append to `ICON_STAGE_PROMPT` (inside the stage block string, after the banned-clichés line):

```
- `image_prompt`: a prompt for an image model to draw exactly this mark.
  Describe the visual device concretely and ALWAYS restate the constraints:
  "flat vector logo mark, <the device>, <N> solid colors (<name them>),
  plain white background, no text, no letters, no gradients, no shadows,
  centered, generous margin".
```

Add the post-step function (after `_validate_turn`):

```python
def apply_image_marks(result):
    """Icon-stage post-step (generate -> vectorize): draw each candidate's
    image_prompt with the image model, trace it, and swap the traced paths
    into the design. Per-candidate fail-open — any generation/trace/
    validation failure leaves that candidate on its authored paths; a turn
    never comes back blank because of the image path. Always strips
    image_prompt from the payload. Gemini attempt cost is folded into
    result.cost_usd so the view's existing record_attempt_cost covers image
    spend under the same budget kill-switch."""
    prompts = [design.pop("image_prompt", "") for design in result.designs]
    if not logo_image.enabled():
        return result
    indexed = [(i, prompt) for i, prompt in enumerate(prompts) if prompt]
    if not indexed:
        return result
    images, cost = logo_image.generate_mark_images([prompt for _, prompt in indexed])
    result.cost_usd = (result.cost_usd or Decimal("0")) + cost
    for (i, _), png in zip(indexed, images):
        if not png:
            continue
        traced = logo_trace.trace_mark(png)
        validated = _validate_custom_paths(traced) if traced else None
        if validated:
            result.designs[i]["paths"] = validated
    return result
```

Change the tail of `converse_turn` from `return _validate_turn(stage, parsed, cost)` to:

```python
    result = _validate_turn(stage, parsed, cost)
    if stage == "icon":
        result = apply_image_marks(result)
    return result
```

(No view changes: `logo_converse` in `views.py` already records `result.cost_usd` and the kill-switch sums `LogoAiUsage.usd_spent`. The spec's "prompt bumps a version" is a no-op here — the converse prompts carry no version constant; the old `PROMPT_VERSION` died with the retired pack cache.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_converse.py apps/tenant_config/tests/test_logo_converse_views.py -v`
Expected: all pass (new tests + every pre-existing test in both files — the pre-existing icon tests have no `image_prompt` and `logo_image.enabled()` is False in test settings because `GEMINI_API_KEY` defaults empty, so behavior is byte-identical).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # expect: main — STOP if not
git add backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/logo_converse.py backend/apps/tenant_config/tests/test_logo_converse.py backend/apps/tenant_config/tests/test_logo_converse_views.py
git commit -m "feat(logo-v2): image-model icon marks — generate, vectorize, fail-open per candidate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Critique keep-rule (unchanged elements keep traced paths)

**Files:**
- Modify: `backend/apps/tenant_config/logo_converse.py` (`critique_turn` + new `_inherit_traced_paths`)
- Modify: `backend/apps/tenant_config/tests/test_logo_converse.py`

**Interfaces:**
- Consumes: `critique_turn(stage, draft, images)` already receives the server-cached draft dict `{"designs": [...], ...}` where each design has `paths` + `elements` (see `views.py:396`).
- Produces: `critique_turn`'s `TurnResult.designs[i]["paths"]` — draft paths when the critique kept a design (identical `elements`), recompiled paths on a genuine redraw.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/tenant_config/tests/test_logo_converse.py`:

```python
# --- critique keep-rule: unchanged elements keep traced paths --------------
# _TRACED_PATHS and _ICON_TURN already exist in this file (_ICON_TURN from
# before this feature; _TRACED_PATHS added by the image-marks block above:
# [{"d": "M 10.0 10.0 C 20.0 10.0 30.0 20.0 30.0 30.0 Z", "fill": "mark"}]).


def _draft_with_traced_paths():
    """A cached icon draft whose paths came from tracing (NOT from compiling
    its elements) — exactly what apply_image_marks produces."""
    design = dict(_ICON_TURN["designs"][0])
    design["paths"] = list(_TRACED_PATHS)
    return {"stage": "icon", "designs": [design], "message": "draft"}


def _critique(monkeypatch, draft, critique_designs):
    parsed = logo_converse._IconTurn.model_validate({"message": "Reviewed.", "designs": critique_designs})
    monkeypatch.setattr(
        logo_converse.core_ai, "structured_messages", lambda **kwargs: (parsed, Decimal("0.01"), "m")
    )
    return logo_converse.critique_turn("icon", draft, ["ZmFrZQ=="])


def test_critique_with_unchanged_elements_keeps_traced_paths(monkeypatch):
    draft = _draft_with_traced_paths()
    kept = {k: v for k, v in _ICON_TURN["designs"][0].items()}  # same elements, no paths field
    result = _critique(monkeypatch, draft, [kept])
    assert result.designs[0]["paths"] == _TRACED_PATHS


def test_critique_redraw_recompiles_from_new_elements(monkeypatch):
    draft = _draft_with_traced_paths()
    # Same element type, different geometry — a genuine redraw.
    redrawn = {**_ICON_TURN["designs"][0], "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 20}]}
    result = _critique(monkeypatch, draft, [redrawn])
    assert result.designs[0]["paths"] != _TRACED_PATHS
    assert result.designs[0]["elements"][0]["r"] == 20
```

(The point is: identical elements → traced paths inherited; different elements → compiled paths win. `_ICON_TURN`'s existing element is `{"type": "circle", "cx": 50, "cy": 50, "r": 30}` — the redraw only changes `r`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_converse.py -v -k "keep or recompiles"`
Expected: `test_critique_with_unchanged_elements_keeps_traced_paths` FAILS (paths are the compiled circle, not `_TRACED_PATHS`); the redraw test may already pass.

- [ ] **Step 3: Implement**

In `backend/apps/tenant_config/logo_converse.py`, add after `_validate_turn`:

```python
def _inherit_traced_paths(draft_designs, result):
    """A critique that keeps a design 'byte-identical' re-emits its elements
    and _validate_turn recompiles them — which would silently replace traced
    (image-derived) paths with authored ones. Any critiqued design whose
    elements match a draft design inherits that draft's exact paths; genuine
    redraws keep their recompiled paths. Harmless for non-traced designs
    (identical elements compile to identical paths)."""
    paths_by_elements = {
        json.dumps(design.get("elements"), sort_keys=True): design["paths"]
        for design in draft_designs
        if design.get("paths")
    }
    for design in result.designs:
        kept = paths_by_elements.get(json.dumps(design.get("elements"), sort_keys=True))
        if kept:
            design["paths"] = kept
    return result
```

In `critique_turn`, change the final `return _validate_turn(stage, parsed, cost)` to:

```python
    return _inherit_traced_paths(draft.get("designs") or [], _validate_turn(stage, parsed, cost))
```

(`critique_refine` needs no change — editor refine never has traced marks; images are icon-stage only.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_converse.py apps/tenant_config/tests/test_logo_converse_views.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # expect: main — STOP if not
git add backend/apps/tenant_config/logo_converse.py backend/apps/tenant_config/tests/test_logo_converse.py
git commit -m "feat(logo-v2): critique keep-rule — unchanged designs retain traced paths

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full backend suite**

Run: `make test`
Expected: all pass, 0 failures (suite was ~945+ green before this feature; only additions).

- [ ] **Step 2: Lint**

Run: `make lint`
Expected: pre-commit passes with zero issues (ruff will police import order in `logo_converse.py`; `bandit` must not flag `logo_image.py` — the requests call has an explicit `timeout`).

- [ ] **Step 3: Runtime smoke (per repo rule: `make dev` + verify before claiming done)**

The stack is already rebuilt from Task 2. Verify boot + feature-off posture:

```bash
make health-check
docker compose exec django python -c "
from django.conf import settings
from apps.tenant_config import logo_image, logo_trace
print('gemini key set:', bool(settings.GEMINI_API_KEY))
print('enabled():', logo_image.enabled())
print('trace importable:', callable(logo_trace.trace_mark))
"
```

Expected: health OK; `enabled(): False` unless the user has added `GEMINI_API_KEY` to `.env`; module imports clean under the running container.

If (and only if) `.env` already contains a real `GEMINI_API_KEY`, optionally exercise one real icon turn from the studio UI on a paid dev tenant and eyeball a traced mark — this spends real money (~$0.20), so skip unless the user asks.

- [ ] **Step 4: Report**

No commit here. Summarize: tests added/passing counts, byte-identical behavior with key unset, and the two follow-ups that stay manual — the user adds `GEMINI_API_KEY` to `.env`/`.env.prod`, and a real-key browser eval of trace quality before prod deploy.

---

## Self-review notes (spec ↔ plan)

- Spec §1 (provider: settings, parallel, 1K, cost-from-usageMetadata + flat fallback, key-unset off, not via AI_PROVIDER) → Task 1.
- Spec §2 (deps, quantize ≤3 colors + white-drop, vtracer flat settings, rescale to 0-100, area→role mapping with `accent` token, caps + one coarse retry + reject, revalidation through `validate_recipe`) → Task 2 (validation through the boundary lands in Task 3's `_validate_custom_paths`, where its consumer is).
- Spec §3 (`image_prompt` field + prompt block, generate→trace→swap, per-candidate fail-open, cost into `LogoAiUsage` via `record_attempt_cost`, quotas unchanged, name/tagline untouched) → Task 3. "Prompt bumps a version" is a documented no-op (no version constant exists post-pack-retirement).
- Spec "critique keep-rule" → Task 4.
- Spec testing section → Tasks 1–4 test steps; spec's "fixture PNGs checked into tests/fixtures/" is deliberately improved to Pillow-drawn in-test fixtures (deterministic, no binaries in git).
- Frontend: zero changes (spec: "the wizard renders whatever paths arrive").
