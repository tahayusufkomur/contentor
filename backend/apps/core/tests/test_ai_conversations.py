"""Conversation substrate: models + kernel helpers (kernel half arrives in
the next task — this file starts with the model contract)."""

from datetime import timedelta

import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.core import assistant
from apps.core.models import AiConversation, AiMessage

pytestmark = pytest.mark.django_db


def _convo(**kw):
    defaults = {"feature": "student_bot", "audience": "student", "tenant_schema": "t1", "session_id": "s-1"}
    defaults.update(kw)
    return AiConversation.objects.create(**defaults)


class TestConversationModel:
    def test_defaults(self):
        c = _convo()
        assert c.status == AiConversation.STATUS_AI
        assert c.human_requested is False
        assert c.agent_user_id is None and c.user_id is None

    def test_session_unique_per_feature_and_tenant(self):
        _convo()
        # same session id is fine for a different tenant or feature…
        _convo(tenant_schema="t2")
        _convo(feature="help_bot", tenant_schema="t1")
        # …but a duplicate triple collides
        with pytest.raises(IntegrityError):
            _convo()

    def test_messages_ordered_and_cascade(self):
        c = _convo()
        AiMessage.objects.create(conversation=c, role="user", content="q")
        AiMessage.objects.create(conversation=c, role="assistant", content="a", transcript_id=7)
        assert [m.role for m in c.messages.all()] == ["user", "assistant"]
        c.delete()
        assert AiMessage.objects.count() == 0


class _User:
    def __init__(self, pk=5, name="Ada Lovelace", email="ada@x.com"):
        self.id = pk
        self.name = name  # accounts.User has `name`, not first_name
        self.email = email
        self.is_authenticated = True


class TestKernelHelpers:
    def test_get_or_create_roundtrip_and_user_stamp(self):
        c1 = assistant.get_or_create_conversation(
            feature="student_bot", audience="student", tenant_schema="t1", session_id="s-9", user=_User()
        )
        c2 = assistant.get_or_create_conversation(
            feature="student_bot", audience="student", tenant_schema="t1", session_id="s-9"
        )
        assert c1.pk == c2.pk
        assert c1.user_id == 5 and c1.user_label == "Ada"

    def test_blank_session_returns_none(self):
        assert (
            assistant.get_or_create_conversation(
                feature="student_bot", audience="student", tenant_schema="t1", session_id=""
            )
            is None
        )

    def test_append_message_bumps_timestamps(self):
        c = _convo()
        assistant.append_message(c, "user", "hello")
        c.refresh_from_db()
        assert c.last_user_message_at is not None
        assistant.append_message(c, "agent", "hi", transcript_id=None)
        c.refresh_from_db()
        assert c.last_agent_message_at is not None
        assert c.messages.count() == 2

    def test_auto_release_boundary(self, settings):
        settings.ASSISTANT_HUMAN_IDLE_RELEASE_MIN = 30
        c = _convo(status="human")
        AiConversation.objects.filter(pk=c.pk).update(taken_over_at=timezone.now() - timedelta(minutes=29))
        c.refresh_from_db()
        assert assistant.maybe_auto_release(c).status == "human"
        AiConversation.objects.filter(pk=c.pk).update(taken_over_at=timezone.now() - timedelta(minutes=31))
        c.refresh_from_db()
        released = assistant.maybe_auto_release(c)
        assert released.status == "ai"
        assert list(c.messages.values_list("content", flat=True)) == ["assistant_resumed"]

    def test_thread_payload_incremental(self):
        c = _convo()
        m1 = assistant.append_message(c, "user", "q")
        m2 = assistant.append_message(c, "assistant", "a")
        full = assistant.thread_payload(c)
        assert [m["id"] for m in full["messages"]] == [m1.id, m2.id]
        assert full["status"] == "ai" and full["session_id"] == "s-1"
        tail = assistant.thread_payload(c, after_id=m1.id)
        assert [m["id"] for m in tail["messages"]] == [m2.id]
