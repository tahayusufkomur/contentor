"""Conversation substrate: models + kernel helpers (kernel half arrives in
the next task — this file starts with the model contract)."""

import pytest
from django.db import IntegrityError

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
