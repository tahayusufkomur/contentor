"""Task 2.2: no prompt names a language (the appended rule does), and the provisioning compose
step asks for the site's language although it runs on the public connection."""

import pytest
from django_tenants.utils import schema_context

from apps.core import tasks
from apps.core.onboarding import ai_compose, ai_curate, site_composer
from apps.core.tests.i18n_utils import translated
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def test_the_provisioning_compose_asks_for_the_tenants_language(tenant_ctx, monkeypatch):
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Glow", default_locale="tr")
    asked = []

    def fake_compose(pages, **kwargs):
        asked.append(kwargs["language"])
        return pages, {}

    def public_thread(label, tenant, fn, timeout):
        with schema_context("public"):  # the worker thread's connection: a bare site_language() is "en" here
            return fn(), "ok"

    monkeypatch.setattr(ai_compose, "compose_available", lambda: True)
    monkeypatch.setattr(ai_compose, "compose_pages", fake_compose)
    monkeypatch.setattr(tasks, "_run_ai_step", public_thread)
    tasks._compose_pages_with_ai(tenant_ctx, {"niche": "yoga"}, {"home": {"blocks": []}})
    assert asked == ["tr"]


def test_no_static_prompt_hard_wires_a_language():
    from apps.blog import ai as blog_ai
    from apps.email_campaigns import designer
    from apps.media import design_ai
    from apps.tenant_config import help_bot, interview, look_copy, student_bot

    prompts = {
        "compose": ai_compose.SYSTEM_PROMPT,
        "look_copy": look_copy.SYSTEM,
        "designer": designer.CONTENT_RULES,
        "design_ai": design_ai.WORDS_SYSTEM,
        "blog": blog_ai.BLOG_STATIC_PROMPT + blog_ai.TOPIC_STATIC_PROMPT,
        "student_bot": student_bot._PERSONA_TEMPLATE,
        "help_bot": help_bot._PERSONA + help_bot._VISITOR_PERSONA,
        "interview": interview.SYSTEM,
    }
    for name, text in prompts.items():
        for phrase in (
            "Write in English",
            "in English,",
            "language named",
            "Mirror the",
            "Same language as",
            "language of the",
            "her language",
        ):
            assert phrase not in text, (name, phrase)


def test_the_brief_blocks_name_no_language():
    brief = ai_curate.CoachBrief(niche="yoga", brand_name="Glow")
    assert "writes in" not in ai_curate.brief_block(brief)
    user = ai_compose._brief(
        {}, brand_name="G", niche="yoga", description="", followups=(), goals=[], courses=(), downloads=()
    )
    assert "Write ALL copy" not in user


def test_fallback_copy_follows_the_site_language_and_english_is_whole_sentences():
    for solo in (True, False):
        ctx = site_composer._ctx("yoga", "Flow Studio", said="I" if solo else "we", language="en")
        assert ctx["language"] == "en"
        sentence = site_composer.fallback_fields("cta", "courses", "cta", ctx)["text"]
        assert sentence == (
            "Tell me a little about yourself and I will point you to the right course."
            if solo
            else "Tell us a little about yourself and we will point you to the right course."
        )


@pytest.mark.parametrize("lang", ["tr", "de", "pl"])
def test_every_fallback_sentence_reads_in_the_site_language(lang):
    """AI off, failed or invalid: the sentences a visitor reads come from the language's .po, whole."""
    ctx = site_composer._ctx("yoga", "Flow Studio", said="we", language=lang)
    cta = site_composer.fallback_fields("cta", "courses", "cta", ctx)
    assert cta["text"] == translated("Tell us a little about yourself and we will point you to the right course.", lang)
    story = site_composer.fallback_fields("story", "home", "story.a", ctx)
    assert (
        translated("Here you'll find our courses and a simple way to reach us whenever a question comes up.", lang)
        in story["body"]
    )
    hero = site_composer.fallback_fields("hero", "home", "hero.full", ctx)
    assert hero["headline"] == translated("Steadier breath, quieter mind", lang)
    assert "%(" not in repr(site_composer.fallback_fields("faq", "events", "faq", ctx))
    ctx = site_composer._ctx("yoga", "Flow Studio", said="I", language=lang)
    about = site_composer.fallback_fields("hero", "about", "hero.intro", ctx)
    assert about["subhead"].startswith(ctx["why"]) and "%(" not in about["subhead"]
    assert site_composer.fallback_fields("cta", "courses", "cta", ctx)["text"] == translated(
        "Tell me a little about yourself and I will point you to the right course.", lang
    )
