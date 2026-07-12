"""Production settings refuse a dev SECRET_KEY or a wildcard ALLOWED_HOSTS
(audit P1-B)."""

from __future__ import annotations

import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def _import_prod(monkeypatch, *, secret_key, allowed_hosts):
    sys.modules.pop("config.settings.prod", None)
    monkeypatch.setenv("DJANGO_SECRET_KEY", secret_key)
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", allowed_hosts)
    monkeypatch.setenv("BILLING_BYPASS_ENABLED", "false")
    monkeypatch.setenv("LIVE_FAKE_ENABLED", "false")
    monkeypatch.setenv("EMAIL_SINK_ENABLED", "false")
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    return importlib.import_module("config.settings.prod")


def test_prod_refuses_dev_secret_key(monkeypatch):
    with pytest.raises(ImproperlyConfigured) as excinfo:
        _import_prod(monkeypatch, secret_key="insecure-dev-key", allowed_hosts="contentor.app")
    assert "DJANGO_SECRET_KEY" in str(excinfo.value)


def test_prod_refuses_wildcard_allowed_hosts(monkeypatch):
    with pytest.raises(ImproperlyConfigured) as excinfo:
        _import_prod(monkeypatch, secret_key="a-real-secret", allowed_hosts="*")
    assert "DJANGO_ALLOWED_HOSTS" in str(excinfo.value)


def test_prod_accepts_strong_secret_and_explicit_hosts(monkeypatch):
    mod = _import_prod(monkeypatch, secret_key="a-real-secret", allowed_hosts=".contentor.app,localhost")
    assert mod.DEBUG is False
    sys.modules.pop("config.settings.prod", None)
