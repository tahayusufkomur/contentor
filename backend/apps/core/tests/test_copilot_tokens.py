"""Single-use signed action tokens: the guardrail that makes 'the AI can do
everything' safe — execute can't be forged, replayed, or fired cross-tenant."""

from unittest import mock

import pytest

from apps.core.copilot import tokens

pytestmark = pytest.mark.django_db

ACTION = {"kind": "add_block", "page": "home"}


def test_roundtrip_returns_action_once():
    t = tokens.stash_action("demo_yoga", ACTION)
    assert tokens.take_action(t, "demo_yoga") == ACTION


def test_replay_is_refused():
    t = tokens.stash_action("demo_yoga", ACTION)
    tokens.take_action(t, "demo_yoga")
    with pytest.raises(tokens.ActionTokenError):
        tokens.take_action(t, "demo_yoga")


def test_cross_tenant_is_refused_and_not_consumed():
    t = tokens.stash_action("demo_yoga", ACTION)
    with pytest.raises(tokens.ActionTokenError):
        tokens.take_action(t, "other_schema")
    assert tokens.take_action(t, "demo_yoga") == ACTION  # still usable by its owner


def test_garbage_and_wrong_purpose_are_refused():
    with pytest.raises(tokens.ActionTokenError):
        tokens.take_action("not-a-jwt", "demo_yoga")
    from apps.accounts.tokens import create_magic_link_token

    with pytest.raises(tokens.ActionTokenError):
        tokens.take_action(create_magic_link_token("a@b.c", "demo_yoga", "demo-yoga"), "demo_yoga")


def test_concurrent_claim_loses_when_delete_misses():
    """Two racers can both read the payload; only the one whose delete
    actually removes the key may execute (single-use under concurrency)."""
    t = tokens.stash_action("demo_yoga", ACTION)
    with mock.patch("apps.core.copilot.tokens.cache.delete", return_value=False):
        with pytest.raises(tokens.ActionTokenError):
            tokens.take_action(t, "demo_yoga")
