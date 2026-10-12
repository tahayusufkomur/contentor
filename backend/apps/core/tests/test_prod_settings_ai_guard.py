"""Production settings refuse AI_PROVIDER=cli (a local-dev-only provider:
developer subscription, no CLI binary in the prod image, $0 cost would
blind the budget kill-switches), and AI_VISION_PROVIDER=cli for the same
reasons."""

from __future__ import annotations

import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def _fresh_prod(monkeypatch, provider, vision=""):
    sys.modules.pop("config.settings.prod", None)
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", "contentor.app")
    monkeypatch.setenv("BILLING_BYPASS_ENABLED", "false")
    monkeypatch.setenv("EMAIL_SINK_ENABLED", "false")
    monkeypatch.setenv("CURATED_IMAGE_API_FAKE", "false")
    monkeypatch.setenv("AI_PROVIDER", provider)
    monkeypatch.setenv("AI_VISION_PROVIDER", vision)
    return importlib.import_module("config.settings.prod")


def test_prod_settings_refuses_cli_provider(monkeypatch):
    with pytest.raises(ImproperlyConfigured) as excinfo:
        _fresh_prod(monkeypatch, "cli")
    assert "AI_PROVIDER" in str(excinfo.value)


def test_prod_settings_refuses_cli_for_image_calls(monkeypatch):
    with pytest.raises(ImproperlyConfigured) as excinfo:
        _fresh_prod(monkeypatch, "agentc", vision="cli")
    assert "AI_VISION_PROVIDER" in str(excinfo.value)


def test_prod_settings_accepts_anthropic_provider(monkeypatch):
    mod = _fresh_prod(monkeypatch, "anthropic")
    assert mod.AI_PROVIDER == "anthropic"


def test_ai_cli_model_defaults_to_haiku(monkeypatch):
    monkeypatch.delenv("AI_CLI_MODEL", raising=False)
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    mod = _fresh_prod(monkeypatch, "anthropic")
    assert mod.AI_CLI_MODEL == "haiku"
