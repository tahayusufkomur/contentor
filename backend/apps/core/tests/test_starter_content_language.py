"""What setup writes onto a site is in the site's language (Task 1.4).

Every test runs with English active (what a creator-role request would be) on a site whose language is
Turkish: the written content must follow the site, not the active language. A site in English gets what it
always got.
"""

import pytest
from django.core.cache import cache
from django.utils.translation import override, pgettext

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan
from apps.core.onboarding.compose import build_config_overrides
from apps.core.tasks import _create_default_config
from apps.core.tests.i18n_utils import translated
from apps.email_campaigns import starters
from apps.notifications.templates_builtin import builtin_templates
from apps.tenant_config import interview_milestones as ms
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

BRAND = "Glow"


@pytest.fixture()
def tr_site(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name=BRAND)
    cfg.brand_name, cfg.default_locale, cfg.timezone = BRAND, "tr", "Europe/Berlin"
    cfg.setup_flow = {"status": "active", "interview": {"turns": [], "fired": []}, "draft_status": {}}
    cfg.save()
    cache.delete(f"tenant:{tenant_ctx.schema_name}:config")
    return cfg


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@glow.test", name="Ana Lind", password="x", role="owner")  # noqa: S106


def _labels(overrides):
    return [link["label"] for link in overrides["navbar_config"]["links"]]


def _all_text(value):
    """Every string in a nested structure."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _all_text(v)
    elif isinstance(value, list | tuple):
        for v in value:
            yield from _all_text(v)


def test_nav_labels_and_blocks_follow_the_site_language():
    got = build_config_overrides({}, brand_name=BRAND, landing_sections={}, locale="tr")
    assert _labels(got) == [translated("Courses"), translated("About"), translated("FAQ")]
    assert got["navbar_config"]["cta"]["text"] == translated("Start a course")
    home = got["pages"]["home"]["blocks"]
    assert home[0]["heading"] == translated("Welcome to %(brand)s") % {"brand": BRAND}
    assert {b["heading"] for b in home if b["type"] == "courseGrid"} == {translated("Featured Courses")}
    contact = got["pages"]["contact"]["blocks"][0]
    assert contact["successMessage"] == translated("Thanks! We'll get back to you soon.")


def test_the_about_fallback_names_the_brand_and_the_classes_in_the_site_language():
    got = build_config_overrides({"niche": "yoga"}, brand_name=BRAND, landing_sections={}, locale="tr")
    body = got["pages"]["about"]["blocks"][-1]["body"]
    assert body == translated("%(brand)s offers %(topic)s you can follow from anywhere.") % {
        "brand": BRAND,
        "topic": translated("%(niche)s classes") % {"niche": "yoga"},
    }


def test_the_default_config_is_written_in_the_site_language(tenant_ctx):
    TenantConfig.objects.all().delete()
    _create_default_config(tenant_ctx, "tr")
    cfg = TenantConfig.objects.get()
    assert cfg.default_locale == "tr"
    assert [link["label"] for link in cfg.navbar_config["links"]] == [
        translated("Courses"),
        translated("Events"),
        translated("About"),
    ]
    assert cfg.navbar_config["cta"]["text"] == translated("Get Started")
    assert cfg.pages["home"]["blocks"][0]["heading"] == translated("Welcome to %(brand)s") % {"brand": tenant_ctx.name}
    assert cfg.pages["pricing"]["blocks"][0]["heading"] == translated("Plans & Pricing")
    assert cfg.landing_sections["cta"]["button_text"] == translated("Join Now")
    assert cfg.landing_sections["about"]["heading"] == translated("About Me")


def test_membership_descriptions_end_in_the_site_language(tr_site, tenant_ctx):
    answers = {"offers": ["course"], "payments": ["membership"], "memberships": ["digital"]}
    ms.sync_memberships(tenant_ctx, answers)
    plan = SubscriptionPlan.objects.get()
    assert plan.description.endswith(translated("Cancel any time."))
    # No "teaches" answer: the fallback is spoken in the site's language too.
    assert translated("everything I teach") in plan.description


def test_membership_description_keeps_her_own_words(tr_site, tenant_ctx):
    answers = {"offers": ["course"], "payments": ["membership"], "memberships": ["digital"], "teaches": "Ashtanga Yoga"}
    ms.sync_memberships(tenant_ctx, answers)
    assert "ashtanga yoga" in SubscriptionPlan.objects.get().description


def test_starter_emails_are_written_in_the_site_language(tr_site, tenant_ctx, owner):
    tenant_ctx.wizard_state = {
        "answers": {"offers": ["course", "live"], "pitch": "Ten minutes a day.", "outcome": "More energy, Less stress"}
    }
    tenant_ctx.save(update_fields=["wizard_state"])
    made = {t.category: t for t in starters.ensure(tenant_ctx)}
    assert made["newsletter"].subject == translated("News from %(brand)s") % {"brand": BRAND}
    assert made["launch"].subject == translated("Something new from %(brand)s") % {"brand": BRAND}
    assert made["event"].subject == translated("Join me live")
    assert made["note"].subject == translated("A note from %(name)s") % {"name": "Ana"}
    assert made["newsletter"].name == translated("Newsletter")
    assert made["newsletter"].preheader == translated("What's new, and what's coming up.")
    words = repr(made["launch"].design)
    assert translated("Until soon,") in words and translated("Hi {{FirstName}},") in words
    # her own words stay as she wrote them, lower-cased and joined in the site's language
    assert translated("%(first)s and %(last)s") % {"first": "more energy", "last": "less stress"} in words


def test_builtin_announcement_templates_are_in_the_site_language(tr_site):
    first = builtin_templates(BRAND)[0]
    assert first["name"] == translated("Welcome")
    assert first["title"] == translated("Welcome to %(brand)s! 🎉") % {"brand": BRAND}
    assert builtin_templates(BRAND)[1]["title"] == translated("A new course just dropped")
    with override("tr"):
        us = pgettext("the brand, when the site has none", "us")
    assert us != "us"
    assert builtin_templates("")[0]["title"] == translated("Welcome to %(brand)s! 🎉") % {"brand": us}


def test_an_english_site_gets_what_it_always_got(tenant_ctx, owner):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name=BRAND)
    cfg.default_locale = "en"
    cfg.save()
    cache.delete(f"tenant:{tenant_ctx.schema_name}:config")
    with override("tr"):  # a Turkish creator on an English site
        assert builtin_templates(BRAND)[0]["title"] == "Welcome to Glow! 🎉"
        assert builtin_templates("")[0]["title"] == "Welcome to us! 🎉"
        made = starters.ensure(tenant_ctx)
    assert next(t for t in made if t.category == "newsletter").subject == "News from Glow"
    assert "Until soon," in repr(made[0].design)
    got = build_config_overrides({}, brand_name=BRAND, landing_sections={}, locale="en")
    assert _labels(got) == ["Courses", "About", "FAQ"]
    cfg.setup_flow = {"status": "active", "interview": {"turns": [], "fired": []}, "draft_status": {}}
    cfg.save()
    with override("tr"):
        ms.sync_memberships(tenant_ctx, {"offers": ["course"], "payments": ["membership"], "memberships": ["digital"]})
    assert SubscriptionPlan.objects.get().description == (
        "All the pre-recorded content, watched any time. "
        "Every digital course, new courses as they land, for everything I teach. Cancel any time."
    )
    assert not [t for t in _all_text(got) if t != t.strip()]


def test_header_links_the_interview_adds_are_in_the_site_language(tr_site, tenant_ctx):
    tr_site.navbar_config = {"links": [], "cta": None}
    tr_site.save()
    ms.sync_site(tenant_ctx, {"offers": ["live"]})
    links = TenantConfig.objects.first().navbar_config["links"]
    assert [link["label"] for link in links] == [translated("Events"), translated("Calendar")]


def test_a_default_header_button_in_the_site_language_still_follows_the_offer(tr_site, tenant_ctx):
    tr_site.navbar_config = {"links": [], "cta": {"text": translated("Start a course"), "href": "/courses"}}
    tr_site.save()
    ms.sync_site(tenant_ctx, {"offers": ["live"]})
    cta = TenantConfig.objects.first().navbar_config["cta"]
    assert cta == {"text": translated("Book a session"), "href": "/events"}
