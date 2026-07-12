"""Production settings refuse AI_PROVIDER=cli (a local-dev-only provider:
developer subscription, no CLI binary in the prod image, $0 cost would
blind the budget kill-switches)."""

from __future__ import annotations

import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def _fresh_prod(monkeypatch, provider):
    sys.modules.pop("config.settings.prod", None)
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", "contentor.app")
    monkeypatch.setenv("BILLING_BYPASS_ENABLED", "false")
    monkeypatch.setenv("LIVE_FAKE_ENABLED", "false")
    monkeypatch.setenv("EMAIL_SINK_ENABLED", "false")
    monkeypatch.setenv("AI_PROVIDER", provider)
    return importlib.import_module("config.settings.prod")


def test_prod_settings_refuses_cli_provider(monkeypatch):
    with pytest.raises(ImproperlyConfigured) as excinfo:
        _fresh_prod(monkeypatch, "cli")
    assert "AI_PROVIDER" in str(excinfo.value)


def test_prod_settings_accepts_anthropic_provider(monkeypatch):
    mod = _fresh_prod(monkeypatch, "anthropic")
    assert mod.AI_PROVIDER == "anthropic"


def test_ai_cli_model_defaults_to_haiku(monkeypatch):
    monkeypatch.delenv("AI_CLI_MODEL", raising=False)
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    mod = _fresh_prod(monkeypatch, "anthropic")
    assert mod.AI_CLI_MODEL == "haiku"
