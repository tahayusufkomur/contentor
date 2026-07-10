"""Phase 0 — Production settings refuse BILLING_BYPASS_ENABLED=true.

Loads `config.settings.prod` in an isolated environment with the bypass flag
turned on, and asserts the import-time guardrail raises ImproperlyConfigured.
"""

from __future__ import annotations

import importlib
import os
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def test_prod_settings_refuses_bypass_enabled(monkeypatch):
    # Ensure the module hasn't been cached from a prior import.
    sys.modules.pop("config.settings.prod", None)

    # Wipe DEV-only required envs that prod might re-validate. We only care
    # about the BILLING_BYPASS_ENABLED guardrail firing.
    monkeypatch.setenv("BILLING_BYPASS_ENABLED", "true")
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")

    with pytest.raises(ImproperlyConfigured) as excinfo:
        importlib.import_module("config.settings.prod")
    assert "BILLING_BYPASS_ENABLED" in str(excinfo.value)


def test_prod_settings_accepts_bypass_disabled(monkeypatch):
    sys.modules.pop("config.settings.prod", None)
    monkeypatch.setenv("BILLING_BYPASS_ENABLED", "false")
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    # Ensure dev-only fakes are off so prod guardrails don't fire.
    monkeypatch.setenv("LIVE_FAKE_ENABLED", "false")
    monkeypatch.setenv("EMAIL_SINK_ENABLED", "false")
    # A fresh settings-module import reads AI_PROVIDER straight from
    # os.environ (bypassing the Django settings layer entirely), so it can
    # leak in the developer's local AI_PROVIDER=cli — neutralize it.
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    # Should import without raising.
    mod = importlib.import_module("config.settings.prod")
    assert mod.BILLING_BYPASS_ENABLED is False
    # Cleanup so other tests can re-import freely.
    sys.modules.pop("config.settings.prod", None)
    # Drop the env so the next test starts clean.
    os.environ.pop("BILLING_BYPASS_ENABLED", None)
