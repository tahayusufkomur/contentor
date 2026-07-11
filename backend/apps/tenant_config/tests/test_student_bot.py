"""Task 7: student site assistant — persona, deterministic knowledge pack,
availability gating (5 reasons: ok/disabled/upgrade_required/budget/quota),
usage accounting, and the SSE completion hook. Anthropic itself is always
mocked via apps.core.ai.stream_text / student_bot.core_ai.available — no
real network access (config/settings/test.py pins AI_PROVIDER="anthropic")."""

import json
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.core import assistant
from apps.core.models import AiTranscript, PlatformPlan, PlatformSubscription, StudentBotUsage
from apps.courses.models import Course, Enrollment
from apps.tenant_config import student_bot
from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_SCHEMA = "shared_test"


def _enable(**kw):
    cfg = AssistantConfig.load()
    cfg.enabled = True
    for k, v in kw.items():
        setattr(cfg, k, v)
    cfg.save()
    return cfg


# ── Fixtures ──────────────────────────────────────────────────────────────
# Mirrors test_logo_ai_views.py's paid_tenant fixture pattern: PlatformPlan /
# PlatformSubscription / User are public-schema (SHARED_APPS), so they're
# created explicitly under "public" while tenant_ctx has activated the tenant
# schema, otherwise the subscription's user FK would resolve against the
# wrong schema.


@pytest.fixture()
def tenant(tenant_ctx):
    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Student Bot Test Paid",
            price_monthly=19,
            transaction_fee_pct=5,
            max_student_bot_questions=100,
        )
        owner = User.objects.create_user(
            email="studentbot-owner@x.com",
            name="Owner",
            password="x",  # noqa: S106
            role="owner",
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture()
def free_tenant(tenant_ctx):
    # No PlatformSubscription -> has_paid_platform_plan is False. The autouse
    # _clean_shared fixture below guarantees no leftover subscription from a
    # previous test using the `tenant` fixture above (same shared schema).
    return tenant_ctx


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Yoga Pro")
    cfg.brand_name = "Yoga Pro"
    cfg.meta_description = ""
    cfg.enabled_modules = []
    cfg.save()
    return cfg


@pytest.fixture()
def instructor(tenant_ctx):
    return User.objects.create_user(
        email="instructor@studentbottest.com", name="Instructor", password="x", role="owner"
    )  # noqa: S106


@pytest.fixture(autouse=True)
def _clean_shared():
    def _scrub():
        with schema_context(SHARED_SCHEMA):
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Student Bot Test Paid").delete()
            User.objects.filter(
                email__in=[
                    "studentbot-owner@x.com",
                    "instructor@studentbottest.com",
                    "viewer-a@studentbottest.com",
                ]
            ).delete()
            StudentBotUsage.objects.all().delete()
            AiTranscript.objects.all().delete()

    _scrub()
    yield
    _scrub()


# ── Knowledge pack ────────────────────────────────────────────────────────


class TestKnowledgePack:
    def test_deterministic_bytes_and_hash(self, tenant, config, instructor):
        Course.objects.create(
            title="Yoga Basics", slug="yoga-basics", price=10, is_published=True, instructor=instructor
        )
        p1, h1 = student_bot.build_system_prompt(tenant, config)
        p2, h2 = student_bot.build_system_prompt(tenant, config)
        assert p1 == p2 and h1 == h2 and len(h1) == 12

    def test_published_only_and_caps(self, tenant, config, instructor):
        Course.objects.create(title="Hidden", slug="hidden", price=0, is_published=False, instructor=instructor)
        for i in range(35):
            Course.objects.create(title=f"C{i}", slug=f"c{i}", price=5, is_published=True, instructor=instructor)
        prompt, _ = student_bot.build_system_prompt(tenant, config)
        assert "Hidden" not in prompt
        # Count only inside the CATALOG section (the persona's Rules section
        # mentions "<site_knowledge>" and an illustrative "/courses/..." link
        # of its own, unrelated to the catalog cap being tested here).
        catalog = prompt.split("CATALOG:", 1)[1]
        assert catalog.count("/courses/") == 30  # per-type cap

    def test_coach_entries_wrapped_as_data(self, tenant, config):
        AssistantKnowledgeEntry.objects.create(title="Refunds", content="14 days, email us.")
        prompt, _ = student_bot.build_system_prompt(tenant, config)
        assert "Refunds" in prompt and "<site_knowledge>" in prompt and "</site_knowledge>" in prompt

    def test_disabled_entries_excluded_and_hash_changes(self, tenant, config):
        e = AssistantKnowledgeEntry.objects.create(title="T", content="X")
        _, h1 = student_bot.build_system_prompt(tenant, config)
        e.enabled = False
        e.save()
        _, h2 = student_bot.build_system_prompt(tenant, config)
        assert h1 != h2

    def test_membership_plan_uses_tenant_charge_currency_not_plan_currency(self, tenant, config):
        """§6.2 / §11 "currency single-source": every catalog line must use
        tenant_charge_currency(tenant), never a per-item currency field, so a
        plan whose stored `currency` diverges from the tenant's real charge
        currency (e.g. left at the SubscriptionPlan default "TRY" on a
        USD-billing tenant) doesn't show a different currency than courses/
        downloads/live items in the same answer."""
        from apps.billing.models import SubscriptionPlan

        tenant.billing_currency = "USD"
        tenant.save(update_fields=["billing_currency"])
        plan = SubscriptionPlan.objects.create(
            name="Gold", price=Decimal("29.00"), currency="TRY", billing_interval_months=1, is_active=True
        )
        prompt, _ = student_bot.build_system_prompt(tenant, config)
        assert f"{plan.price} USD/month" in prompt
        assert "TRY" not in prompt


# ── Availability (all 5 reasons) ─────────────────────────────────────────


class TestAvailability:
    def test_free_plan_upgrade_required(self, free_tenant, config):
        _enable()
        assert student_bot.availability(free_tenant, AssistantConfig.load()) == (False, "upgrade_required")

    def test_disabled_by_default(self, tenant, config):
        assert student_bot.availability(tenant, AssistantConfig.load()) == (False, "disabled")

    def test_ok_when_enabled_and_within_limits(self, tenant, config):
        _enable()
        with patch.object(student_bot.core_ai, "available", return_value=(True, "ok")):
            assert student_bot.availability(tenant, AssistantConfig.load()) == (True, "ok")

    def test_quota_from_plan(self, tenant, config, settings):
        _enable()
        limit = student_bot.plan_question_limit(tenant)
        u = student_bot.tenant_usage(tenant.schema_name)
        StudentBotUsage.objects.filter(pk=u.pk).update(questions=limit)
        with patch.object(student_bot.core_ai, "available", return_value=(True, "ok")):
            assert student_bot.availability(tenant, AssistantConfig.load()) == (False, "quota")

    def test_global_budget_kill_switch(self, tenant, config, settings):
        _enable()
        settings.STUDENT_BOT_GLOBAL_MONTHLY_USD = 1
        StudentBotUsage.objects.create(
            tenant_schema="other", month=student_bot.current_month(), usd_spent=Decimal("1.5")
        )
        with patch.object(student_bot.core_ai, "available", return_value=(True, "ok")):
            assert student_bot.availability(tenant, AssistantConfig.load()) == (False, "budget")


# ── SSE completion hook (usage + transcript) ─────────────────────────────


class TestSse:
    def _stream(self, *deltas):
        def fake(**kwargs):
            for d in deltas:
                yield ("delta", d)
            yield ("done", {"cost_usd": Decimal("0.003"), "provider": "anthropic", "model": "claude-haiku-4-5"})

        return fake

    def test_records_usage_and_transcript(self, tenant, config):
        _enable()
        history = [{"role": "user", "content": "what courses fit beginners?"}]
        with patch.object(assistant.core_ai, "stream_text", self._stream("Try Yoga Basics")):
            frames = list(
                student_bot.sse_events(
                    history,
                    tenant,
                    student_bot.current_month(),
                    question="what courses fit beginners?",
                    session_id="s1",
                )
            )
        row = AiTranscript.objects.get()
        assert row.feature == "student_bot" and row.audience == "student" and row.kb_hash
        usage = student_bot.tenant_usage(tenant.schema_name)
        assert usage.questions == 1 and usage.usd_spent == Decimal("0.003")
        assert json.loads(frames[-1].removeprefix("data: "))["transcript_id"] == row.id

    def test_preview_skips_question_count_but_accrues_usd(self, tenant, config):
        _enable()
        with patch.object(assistant.core_ai, "stream_text", self._stream("hi")):
            list(
                student_bot.sse_events(
                    [{"role": "user", "content": "q"}],
                    tenant,
                    student_bot.current_month(),
                    question="q",
                    is_preview=True,
                )
            )
        usage = student_bot.tenant_usage(tenant.schema_name)
        assert usage.questions == 0 and usage.usd_spent == Decimal("0.003")
        assert AiTranscript.objects.get().is_preview is True


# ── Answer-cache viewer scoping (final-review hardening) ────────────────────
#
# build_viewer_context(user) injects the signed-in student's enrolled
# courses / owned downloads / membership into the first user turn, and the
# persona is instructed to reference what they already own. The first-turn
# answer cache is keyed on kb_hash (tenant-scoped) + the raw question — never
# on the viewer — so a signed-in student's account-derived cached answer
# would otherwise be replayed verbatim to the next visitor (anonymous or a
# different student) who asks the identical first question.


class TestAnswerCacheViewerScoping:
    def _stream_factory(self, calls):
        def fake(**kwargs):
            calls.append(1)
            # Stand-in for a real answer that references what THIS viewer
            # owns (per build_viewer_context) — the call count marks which
            # viewer's account state it was derived from.
            yield ("delta", f"viewer-answer-{len(calls)}")
            yield ("done", {"cost_usd": Decimal("0.001"), "provider": "anthropic", "model": "m"})

        return fake

    def test_signed_in_viewers_purchase_history_does_not_leak_to_the_next_asker(self, tenant, config, instructor):
        cache.clear()
        student = User.objects.create_user(
            email="viewer-a@studentbottest.com",
            name="Viewer A",
            password="x",  # noqa: S106
            role="student",
        )
        course = Course.objects.create(
            title="Advanced Trading", slug="advanced-trading", price=0, is_published=True, instructor=instructor
        )
        Enrollment.objects.create(user=student, course=course)
        _enable()

        question = "what should I do next?"
        calls = []
        with patch.object(assistant.core_ai, "stream_text", self._stream_factory(calls)):
            history_a = assistant.prepare_history(
                [{"role": "user", "content": question}], student_bot.build_viewer_context(student)
            )
            list(
                student_bot.sse_events(
                    history_a,
                    tenant,
                    student_bot.current_month(),
                    question=question,
                    session_id="sess-a",
                    user=student,
                )
            )

            history_anon = assistant.prepare_history(
                [{"role": "user", "content": question}], student_bot.build_viewer_context(None)
            )
            frames_anon = list(
                student_bot.sse_events(
                    history_anon,
                    tenant,
                    student_bot.current_month(),
                    question=question,
                    session_id="sess-b",
                    user=None,
                )
            )
        delta_text_anon = "".join(
            json.loads(f.removeprefix("data: ").strip())["text"]
            for f in frames_anon
            if json.loads(f.removeprefix("data: ").strip())["type"] == "delta"
        )

        # The model MUST run again for the anonymous asker — a shared cache
        # key would only call it once and replay student A's cached,
        # purchase-history-derived answer.
        assert len(calls) == 2
        assert "viewer-answer-1" not in delta_text_anon
        assert "viewer-answer-2" in delta_text_anon

    def test_anonymous_first_turns_still_cache_normally(self, tenant, config):
        """Not affected by the leak (no viewer state) — must keep caching so
        repeat anonymous questions stay free, matching the marketing bucket."""
        cache.clear()
        _enable()
        calls = []
        question = "what courses do you have?"
        with patch.object(assistant.core_ai, "stream_text", self._stream_factory(calls)):
            for session_id in ("anon-1", "anon-2"):
                history = assistant.prepare_history(
                    [{"role": "user", "content": question}], student_bot.build_viewer_context(None)
                )
                list(
                    student_bot.sse_events(
                        history, tenant, student_bot.current_month(), question=question, session_id=session_id
                    )
                )
        assert len(calls) == 1
        assert AiTranscript.objects.filter(provider="cache").count() == 1
