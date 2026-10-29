"""Copilot, focus and reels speak to the creator in the creator's language (Task 4.3d)."""

import sys
import types
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import translation

from apps.accounts.models import User
from apps.billing import ways
from apps.core import tasks
from apps.core.copilot import runs
from apps.core.focus import jobs
from apps.core.tests.i18n_utils import creator_client, translated
from apps.tenant_config.models import CopilotRun

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SCHEMA = "shared_test"


@pytest.fixture(autouse=True)
def _no_language_leak():
    yield
    translation.activate("en")  # a request through the middleware leaves its language on the worker


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@errorlang-d.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
        preferred_locale="tr",
    )


def test_errors_follow_the_creator_language(tenant_ctx, owner):
    client = creator_client(tenant_ctx, owner)
    res = client.get("/api/v1/reels/?video=abc", HTTP_HOST=HOST)
    assert res.status_code == 400
    assert res.json()["detail"] == translated("video is a video's id.")


def test_a_copilot_run_is_carried_out_in_the_creator_language(owner):
    seen = {}

    def run_turn(*args, **kwargs):
        seen["language"] = translation.get_language()
        return {"kind": "answer", "text": "ok", "specialist": "finance"}, Decimal("0")

    run = CopilotRun.objects.create(actor=owner, specialist="finance", request={"message": "hi"})
    with mock.patch("apps.core.copilot.runs.engine.run_turn", side_effect=run_turn):
        runs.execute(SCHEMA, run.id)
    assert seen["language"] == "tr"
    assert translation.get_language() != "tr"  # and only for the run


def test_a_focus_job_is_carried_out_in_the_creator_language(owner, monkeypatch):
    seen = {}
    stub = types.SimpleNamespace(carry_out=lambda tenant, run_id: seen.update(language=translation.get_language()))
    monkeypatch.setitem(sys.modules, "lang_handler", stub)
    monkeypatch.setitem(jobs.HANDLERS, "lang", "lang_handler")
    run = CopilotRun.objects.create(actor=owner, specialist="content", request={"job": "lang"})
    with mock.patch.object(tasks.run_focus_job, "delay"):
        jobs.execute(SCHEMA, run.id)
    assert seen["language"] == "tr"


def test_the_ways_in_are_one_translated_sentence(owner):
    with translation.override("tr"):
        text = ways.describe({"free": {"window": None}, "buy": None, "plans": []})
    assert text == translated("Free for everyone") + "."
