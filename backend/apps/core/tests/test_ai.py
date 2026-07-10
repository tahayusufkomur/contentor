"""apps.core.ai — the shared AI provider layer
(docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md)."""

from decimal import Decimal

from apps.core import ai


class _Usage:
    def __init__(self, inp=0, out=0, cache_read=0, cache_write=0):
        self.input_tokens = inp
        self.output_tokens = out
        self.cache_read_input_tokens = cache_read
        self.cache_creation_input_tokens = cache_write


def test_estimate_cost_sonnet():
    # 1M input @ $2 + 1M output @ $10
    assert ai.estimate_cost(_Usage(inp=1_000_000, out=1_000_000), "claude-sonnet-5") == Decimal("12")


def test_estimate_cost_unknown_model_uses_default_prices():
    assert ai.estimate_cost(_Usage(inp=1_000_000), "claude-nonexistent") == Decimal("2")


def test_ai_error_carries_cost():
    exc = ai.AiError("boom", cost_usd=Decimal("0.5"))
    assert exc.cost_usd == Decimal("0.5")
    assert ai.AiError("boom").cost_usd == Decimal("0")


def test_available_anthropic_requires_key(settings):
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = ""
    assert ai.available() == (False, "no_api_key")
    settings.ANTHROPIC_API_KEY = "sk-ant-x"
    assert ai.available() == (True, "ok")


def test_available_cli_no_binary(settings, monkeypatch):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: None)
    assert ai.available() == (False, "cli_no_binary")


def test_available_cli_no_token(settings, monkeypatch):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
    assert ai.available() == (False, "cli_no_token")


def test_available_cli_ok(settings, monkeypatch):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oat-token")
    assert ai.available() == (True, "ok")


def test_cli_env_strips_billing_vars(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-be-stripped")
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "also-stripped")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oat-kept")
    env = ai._cli_env()
    assert "ANTHROPIC_API_KEY" not in env
    assert "ANTHROPIC_AUTH_TOKEN" not in env
    assert env["CLAUDE_CODE_OAUTH_TOKEN"] == "oat-kept"
