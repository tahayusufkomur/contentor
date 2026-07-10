"""`manage.py ai_check` — provider preflight + one tiny end-to-end call."""

from decimal import Decimal

import pytest
from django.core.management import call_command


def test_ai_check_fails_fast_on_missing_token(settings, monkeypatch, capsys):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
    with pytest.raises(SystemExit) as excinfo:
        call_command("ai_check")
    assert excinfo.value.code == 1
    err = capsys.readouterr().err
    assert "cli_no_token" in err
    assert "claude setup-token" in err  # the fix-it message


def test_ai_check_succeeds_end_to_end(settings, monkeypatch, capsys):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oat-token")

    def fake_structured(*, system, user, output_model, model, max_tokens):
        return output_model(ok=True), Decimal("0"), "haiku"

    monkeypatch.setattr("apps.core.ai.structured", fake_structured)
    call_command("ai_check")
    out = capsys.readouterr().out
    assert "preflight: ok" in out
    assert "end-to-end: ok" in out


def test_ai_check_reports_failed_call(settings, monkeypatch, capsys):
    from apps.core import ai

    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = "sk-ant-x"

    def fake_structured(**kwargs):
        raise ai.AiError("model unavailable")

    monkeypatch.setattr("apps.core.ai.structured", fake_structured)
    with pytest.raises(SystemExit) as excinfo:
        call_command("ai_check")
    assert excinfo.value.code == 1
    assert "model unavailable" in capsys.readouterr().err
