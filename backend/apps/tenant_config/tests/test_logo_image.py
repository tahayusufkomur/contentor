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
