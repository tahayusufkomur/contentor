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
        cost = (
            Decimal(int(usage.get("promptTokenCount", 0))) * _USD_PER_INPUT_TOKEN
            + Decimal(int(usage.get("candidatesTokenCount", 0))) * _USD_PER_OUTPUT_TOKEN
        )
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
