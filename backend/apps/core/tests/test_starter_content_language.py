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
from apps.core.tests.i18n_utils import gettext_in, translated
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


# ── membership plans: name, perks and blurb ────────────────────────────────────────────────────

OFFERS = {"with courses": ["course", "live", "onsite", "community"], "no courses": ["live", "onsite", "community"]}


def _sync(tenant, tier, offers, teaches=None):
    from apps.tenant_config.setup_flow import _update_flow

    SubscriptionPlan.objects.all().delete()
    _update_flow(tenant, lambda _config, flow: flow.update(drafts={}))
    answers = {
        "offers": offers,
        "payments": ["membership"],
        "memberships": [tier],
        **({"teaches": teaches} if teaches else {}),
    }
    ms.sync_memberships(tenant, answers)
    return SubscriptionPlan.objects.get()


def _old_description(tier, teaches="everything I teach"):
    """What setup wrote before this task (the f-strings it replaced)."""
    perks = ", ".join(p.lower() for p in tier["perks"])
    about = f"{tier['blurb']} {perks[:1].upper()}{perks[1:]}, for {teaches}." if perks else tier["blurb"]
    # The one deliberate difference: lower-casing the perks turned "Everything I offer" into "Everything i offer".
    return f"{about} Cancel any time.".replace("Everything i offer", "Everything I offer")


@pytest.mark.parametrize("offers", OFFERS.values(), ids=OFFERS)
@pytest.mark.parametrize("tier_id", ["digital", "online", "studio", "community", "all"])
def test_a_membership_in_english_reads_as_it_always_did(tenant_ctx, offers, tier_id):
    from apps.tenant_config import interview_brief as brief

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name=BRAND)
    cfg.default_locale = "en"
    cfg.save()
    answers = {"offers": offers, "memberships": [tier_id]}
    tier = brief.membership_of(answers, tier_id)
    with override("tr"):  # the creator's language is not the site's
        for teaches in (None, "Ashtanga Yoga"):
            plan = _sync(tenant_ctx, tier_id, offers, teaches)
            assert plan.name == tier["label"]
            assert plan.description == _old_description(tier, teaches.lower() if teaches else "everything I teach")


@pytest.mark.parametrize("offers", OFFERS.values(), ids=OFFERS)
@pytest.mark.parametrize("tier_id", ["digital", "online", "studio", "community", "all"])
def test_a_membership_on_a_turkish_site_has_no_english_left(tr_site, tenant_ctx, offers, tier_id):
    from apps.tenant_config import interview_brief as brief

    tier = brief.membership_of({"offers": offers, "memberships": [tier_id]}, tier_id)
    plan = _sync(tenant_ctx, tier_id, offers)
    joined = ", ".join(p.lower() for p in tier["perks"])
    sentence = next(s for s in brief.PERKS_SENTENCES if s.lower() == joined)
    assert plan.name == translated(tier["label"])
    assert plan.description.startswith(translated(tier["blurb"]))
    assert translated(sentence) in plan.description
    for english in (tier["label"], tier["blurb"], *tier["perks"]):
        assert english not in plan.description


def test_a_membership_of_her_own_keeps_her_name_and_gets_a_translated_blurb(tr_site, tenant_ctx):
    plan = _sync(tenant_ctx, "Face yoga club", ["course"])
    assert plan.name == "Face yoga club"
    blurb = translated("One monthly price for %(name)s.") % {"name": "face yoga club"}
    # A sentence opens with a capital, whichever word the language puts first ("Face yoga club için …").
    assert plan.description == f"{blurb[:1].upper()}{blurb[1:]} {translated('Cancel any time.')}"


def test_the_fallback_titles_and_button_label_follow_the_site_language():
    from apps.core.onboarding import site_composer as sc

    solo = sc._ctx("yoga", BRAND, "", said="I", language="tr")
    assert solo["why"] == translated("Why I teach %(topic)s") % {"topic": "yoga"}
    assert solo["primaryLabel"] == translated("Browse the courses")
    team = sc._ctx("yoga", BRAND, "", said="we", language="tr")
    assert team["why"] == translated("Why we teach %(topic)s") % {"topic": "yoga"}
    coaching = sc._ctx("coaching", BRAND, "", subject="coaching", said="I", language="tr")
    assert coaching["why"] == translated("Why I coach")
    # English is what it was, whatever language is active
    with override("tr"):
        en = sc._ctx("yoga", BRAND, "", said="I")
    assert (en["why"], en["primaryLabel"]) == ("Why I teach yoga", "Browse the courses")
    assert sc._ctx("yoga", BRAND, "", said="we", links=("/about",))["primaryLabel"] == "About us"


# ── fix round 1 ────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("site, stored", [("tr", "Start a course"), ("tr", "Get Started"), ("en", "Kursa başla")])
def test_a_default_header_button_written_in_another_language_still_follows_the_link(tr_site, tenant_ctx, site, stored):
    """An English default on a Turkish site (or a Turkish one after the site went back to English) is a default,
    not her own words: the label follows the link, in the site's language."""
    from apps.core.languages import CODES

    tr_site.default_locale = site
    if stored == "Kursa başla":
        with override("tr"):
            stored = translated("Start a course")
    tr_site.navbar_config = {"links": [], "cta": {"text": stored, "href": "/courses"}}
    tr_site.save()
    ms.sync_site(tenant_ctx, {"offers": ["live"]})
    want = translated("Book a session") if site == "tr" else "Book a session"
    assert TenantConfig.objects.first().navbar_config["cta"] == {"text": want, "href": "/events"}
    assert {"tr", "en"} <= set(CODES)


def test_a_header_button_in_her_own_words_is_kept_on_a_turkish_site(tr_site, tenant_ctx):
    tr_site.navbar_config = {"links": [], "cta": {"text": "Join my course", "href": "/courses"}}
    tr_site.save()
    ms.sync_site(tenant_ctx, {"offers": ["live"]})
    assert TenantConfig.objects.first().navbar_config["cta"] == {"text": "Join my course", "href": "/events"}


def test_a_creator_reading_a_legacy_site_does_not_get_her_language_written_onto_it(tr_site, tenant_ctx):
    from apps.tenant_config.serializers import TenantConfigSerializer

    tr_site.pages = {}
    tr_site.landing_sections = {}
    tr_site.save()
    with override("de"):  # the creator's language is neither the site's nor English
        data = TenantConfigSerializer(tr_site).data
    assert data["pages"]["home"]["blocks"][0]["heading"] == translated("Welcome to %(brand)s") % {"brand": BRAND}


def test_the_about_fallback_never_shows_a_raw_niche_id_or_we_offers():
    tr = build_config_overrides({"niche": "pole_dance"}, brand_name=BRAND, landing_sections={}, locale="tr")
    body = tr["pages"]["about"]["blocks"][-1]["body"]
    assert body == translated("%(brand)s offers %(topic)s you can follow from anywhere.") % {
        "brand": BRAND,
        "topic": translated("%(niche)s classes") % {"niche": translated("pole dance")},
    }
    assert "pole" not in body.lower().replace(translated("pole dance").lower(), "")
    unknown = build_config_overrides({"niche": "personal_training"}, brand_name=BRAND, landing_sections={}, locale="tr")
    assert "personal" not in unknown["pages"]["about"]["blocks"][-1]["body"]
    team = build_config_overrides({"niche": "yoga"}, brand_name="", landing_sections={}, locale="tr")
    assert team["pages"]["about"]["blocks"][-1]["body"] == translated(
        "We offer %(topic)s you can follow from anywhere."
    ) % {"topic": translated("%(niche)s classes") % {"niche": gettext_in("yoga", "tr")}}
    en = build_config_overrides({"niche": "yoga"}, brand_name="", landing_sections={}, locale="en")
    assert en["pages"]["about"]["blocks"][-1]["body"] == "We offer yoga classes you can follow from anywhere."
    en = build_config_overrides({"niche": "personal_training"}, brand_name=BRAND, landing_sections={}, locale="en")
    assert (
        en["pages"]["about"]["blocks"][-1]["body"]
        == "Glow offers personal training classes you can follow from anywhere."
    )
