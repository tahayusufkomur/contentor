"""Ask Contentor unit tests: transcript validation, CLI provider parsing,
availability gates, and usage accounting. No network, no real subprocess."""

import io
import json
from decimal import Decimal
from pathlib import Path

import pytest

from apps.core.models import HelpBotUsage
from apps.tenant_config import help_bot

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "help_bot_test"
MONTH = "2026-07"


@pytest.fixture()
def kb_file(tmp_path, monkeypatch):
    path = tmp_path / "help_kb.md"
    path.write_text("## Payouts\nConnect Stripe under Payouts.\n\n## ROUTES\n| /admin/payouts | Payouts |")
    monkeypatch.setattr(help_bot, "KB_PATH", path)
    help_bot.system_prompt.cache_clear()
    yield path
    help_bot.system_prompt.cache_clear()


# ── prepare_history ──────────────────────────────────────────────────────────


def test_prepare_history_injects_context_into_first_user_turn():
    history = help_bot.prepare_history(
        [
            {"role": "user", "content": "How do payouts work?"},
            {"role": "assistant", "content": "Via Stripe."},
            {"role": "user", "content": "And when?"},
        ],
        "<tenant_context>Plan: free</tenant_context>",
    )
    assert history[0]["content"].startswith("<tenant_context>")
    assert history[0]["content"].endswith("How do payouts work?")
    assert history[-1] == {"role": "user", "content": "And when?"}


def test_prepare_history_trims_to_recent_messages():
    msgs = []
    for i in range(10):
        msgs.append({"role": "user", "content": f"q{i}"})
        msgs.append({"role": "assistant", "content": f"a{i}"})
    msgs.append({"role": "user", "content": "final"})
    history = help_bot.prepare_history(msgs, "<ctx/>")
    assert len(history) <= help_bot.MAX_HISTORY_MESSAGES
    assert history[-1]["content"] == "final"
    assert history[0]["role"] == "user"


def test_prepare_history_caps_message_length():
    history = help_bot.prepare_history([{"role": "user", "content": "x" * 99999}], "<ctx/>")
    # context + separator + capped message
    assert len(history[0]["content"]) <= len("<ctx/>") + 2 + help_bot.MAX_MESSAGE_CHARS


@pytest.mark.parametrize(
    "bad",
    [
        None,
        [],
        [{"role": "assistant", "content": "hi"}],
        [{"role": "user", "content": ""}],
        [{"role": "system", "content": "hack"}],
        [{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}],
    ],
)
def test_prepare_history_rejects_bad_input(bad):
    with pytest.raises(ValueError):
        help_bot.prepare_history(bad, "<ctx/>")


# ── stream_answer (cli provider, via core.ai) ───────────────────────────────


def _cli_line(obj):
    return json.dumps(obj) + "\n"


class _FakeProc:
    def __init__(self, lines, returncode=0):
        self.stdout = io.StringIO("".join(lines))
        self.stderr = io.StringIO("")
        self.returncode = returncode

    def wait(self, timeout=None):
        return self.returncode

    def poll(self):
        return self.returncode

    def kill(self):
        pass


def test_stream_answer_cli_parses_deltas_and_result(kb_file, monkeypatch, settings):
    settings.AI_PROVIDER = "cli"
    settings.AI_CLI_MODEL = "haiku"
    lines = [
        _cli_line({"type": "system", "subtype": "init"}),
        _cli_line(
            {
                "type": "stream_event",
                "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Connect "}},
            }
        ),
        _cli_line(
            {
                "type": "stream_event",
                "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Stripe."}},
            }
        ),
        _cli_line({"type": "result", "subtype": "success", "total_cost_usd": 0.05}),
    ]
    captured = {}

    def fake_popen(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["env"] = kwargs.get("env")
        return _FakeProc(lines)

    monkeypatch.setattr("subprocess.Popen", fake_popen)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-be-stripped")

    events = list(help_bot.stream_answer([{"role": "user", "content": "payouts?"}]))

    assert [e for e in events if e[0] == "delta"] == [("delta", "Connect "), ("delta", "Stripe.")]
    kind, info = events[-1]
    assert kind == "done"
    # Subscription usage never accrues against the USD caps.
    assert info == {"cost_usd": Decimal("0"), "provider": "cli", "model": "haiku"}
    # The CLI must run on the subscription, never the API key.
    assert "ANTHROPIC_API_KEY" not in captured["env"]
    assert "--disallowedTools" in captured["cmd"]
    assert "--max-turns" in captured["cmd"]
    # The coach persona + KB rides in --system-prompt.
    assert captured["cmd"][captured["cmd"].index("--system-prompt") + 1] == help_bot.system_prompt("coach")


def test_stream_answer_cli_failure_raises(kb_file, monkeypatch, settings):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("subprocess.Popen", lambda cmd, **kw: _FakeProc([], returncode=1))
    with pytest.raises(help_bot.HelpBotError):
        list(help_bot.stream_answer([{"role": "user", "content": "hi"}]))


# ── availability + accounting ────────────────────────────────────────────────


def test_availability_disabled_without_kb(monkeypatch, tmp_path, settings):
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = "sk-x"
    monkeypatch.setattr(help_bot, "KB_PATH", tmp_path / "missing.md")
    assert help_bot.availability(SCHEMA, month=MONTH) == (False, "disabled")


def test_availability_disabled_without_api_key(kb_file, settings):
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = ""
    assert help_bot.availability(SCHEMA, month=MONTH) == (False, "disabled")


def test_availability_cli_requires_binary(kb_file, monkeypatch, settings):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: None)
    assert help_bot.availability(SCHEMA, month=MONTH) == (False, "disabled")
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oat-token")
    assert help_bot.availability(SCHEMA, month=MONTH) == (True, "ok")


def test_availability_disabled_when_cli_token_missing(kb_file, monkeypatch, settings):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
    assert help_bot.availability(SCHEMA, month=MONTH) == (False, "disabled")


def test_availability_global_budget_kill_switch(kb_file, settings):
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = "sk-x"
    settings.HELP_BOT_GLOBAL_MONTHLY_USD = 1.0
    HelpBotUsage.objects.create(tenant_schema="someone_else", month=MONTH, usd_spent=Decimal("1.5"))
    assert help_bot.availability(SCHEMA, month=MONTH) == (False, "budget")


def test_availability_tenant_quota(kb_file, settings):
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = "sk-x"
    settings.HELP_BOT_TENANT_MONTHLY_QUESTIONS = 3
    HelpBotUsage.objects.create(tenant_schema=SCHEMA, month=MONTH, questions=3)
    assert help_bot.availability(SCHEMA, month=MONTH) == (False, "quota")


def test_repo_kb_exists_and_fits_token_budget():
    """The KB rides in every request's (cached) system prompt — keep it under
    ~15K tokens (~60K chars) so it never silently bloats the prefix."""
    text = (Path(help_bot.__file__).parent / "help_kb.md").read_text(encoding="utf-8")
    assert len(text) < 60_000
    assert "## ROUTES" in text


def test_record_question_accrues_cost_and_count():
    help_bot.record_question(SCHEMA, Decimal("0.0123"), month=MONTH)
    help_bot.record_question(SCHEMA, Decimal("0"), month=MONTH)
    row = HelpBotUsage.objects.get(tenant_schema=SCHEMA, month=MONTH)
    assert row.questions == 2
    assert row.usd_spent == Decimal("0.0123")
