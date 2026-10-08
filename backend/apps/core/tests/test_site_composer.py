"""Site composer (apps.core.onboarding.site_composer): skeletons, guardrails,
the plan + fill passes with repair/fallback, photo placement, build status,
and the styled provisioning path. AI and the photo catalog are faked."""

import json
from decimal import Decimal
from types import SimpleNamespace
from uuid import NAMESPACE_URL, uuid5

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

from apps.core import ai as core_ai
from apps.core.curated_images import client as curated_client
from apps.core.onboarding import site_composer as sc
from apps.tenant_config import sections
from apps.tenant_config.defaults import KNOWN_PAGE_KEYS

ENABLED = sorted(sections.enabled_styles())


# ── pure: skeletons + guardrails ────────────────────────────────────────────


def _required_filled(block):
    family = sections.family_of(block["type"])
    for name, spec in sections.families()[family]["fields"].items():
        if spec["type"] in ("text", "richtext") and spec.get("required"):
            assert str(block.get(name) or "").strip(), (family, name)
        if spec["type"] == "items" and name in block:
            assert spec.get("min", 0) <= len(block[name]) <= spec.get("max", 99), (family, name)
            for item in block[name]:
                for sub, sub_spec in spec["fields"].items():
                    if sub_spec["type"] == "text" and sub_spec.get("required"):
                        assert str(item.get(sub) or "").strip(), (family, name, sub)


@pytest.mark.parametrize("style_id", ENABLED)
@pytest.mark.parametrize("brand", ["Maya Laurent", "Flow Studio"])
def test_skeleton_pages_are_valid_for_every_enabled_style(style_id, brand):
    pages = sc.skeleton_pages(style_id, niche="pole_dance", brand_name=brand, description="")
    assert set(pages) == set(KNOWN_PAGE_KEYS)
    for page, value in pages.items():
        blocks = value["blocks"]
        assert blocks[0]["type"] == "section.hero"
        assert blocks[-1]["type"] in ("section.cta", "section.contact")
        assert (blocks[0]["variant"] == f"{style_id}.intro") == (page != "home")
        for block in blocks:
            assert sections.clean_section_block(block) == block
            assert block["variant"].startswith(f"{style_id}.")
            assert block["id"].startswith("blk_")
            _required_filled(block)
            assert not sc._hard(sc._problems(sections.family_of(block["type"]), block))
            for name in sections.image_fields(sections.family_of(block["type"])):
                assert block[name] == {"url": None, "photo_id": None, "alt": None}


def test_skeleton_copy_is_honest_and_in_voice():
    solo = sc.skeleton_pages("journal", niche="yoga", brand_name="Maya Laurent", description="")
    studio = sc.skeleton_pages("journal", niche="yoga", brand_name="Flow Studio", description="")
    text = json.dumps(solo) + json.dumps(studio)
    assert "!" not in text
    assert sc._banned(text) is None
    story = next(b for b in solo["home"]["blocks"] if b["type"] == "section.story")
    assert story["signature"] == "Maya Laurent" and story["heading"] == "Why I teach yoga"
    studio_story = next(b for b in studio["home"]["blocks"] if b["type"] == "section.story")
    assert studio_story["heading"] == "Why we teach yoga" and "signature" not in studio_story
    described = sc.skeleton_pages("journal", niche="yoga", brand_name="Flow Studio", description="Slow <b>flow</b>.")
    body = next(b for b in described["home"]["blocks"] if b["type"] == "section.story")["body"]
    assert "Slow &lt;b&gt;flow&lt;/b&gt;." in body  # the coach's own words, escaped


@pytest.mark.parametrize(
    ("brand", "description", "expected"),
    [
        ("Maya Laurent", "", "I"),
        ("Flow Studio", "", "we"),
        ("Flow Studio", "I teach slow flow to desk workers", "I"),
        ("Maya Laurent Yoga", "", "we"),
        ("Studio 9", "", "we"),
    ],
)
def test_speaker(brand, description, expected):
    assert sc.speaker(brand, description) == expected


def _families(entries):
    return [e["family"] for e in entries]


@pytest.mark.parametrize(
    ("page", "raw", "expected"),
    [
        # hero moved first; unknown family replaced by the recipe's entry at that position
        ("home", ["story", "hero", "nonsense", "cta"], ["hero", "story", "benefits", "cta"]),
        # missing closing section -> a cta is appended
        ("about", ["hero", "story", "philosophy"], ["hero", "story", "philosophy", "cta"]),
        # contact page: the contact section moves to the end
        ("contact", ["hero", "contact", "faq"], ["hero", "faq", "contact"]),
        # required family inserted after the hero
        ("courses", ["hero", "faq", "cta"], ["hero", "courseShowcase", "faq", "cta"]),
        # three photo-led sections in a row -> a quiet one moves up
        ("home", ["hero", "story", "moments", "benefits", "cta"], ["hero", "story", "benefits", "moments", "cta"]),
        # pricing is pricing-page only; duplicates dropped
        ("home", ["hero", "pricing", "benefits", "benefits", "cta"], ["hero", "story", "benefits", "cta"]),
    ],
)
def test_guardrails(page, raw, expected):
    plan = {"pages": {page: [{"family": f, "variant": ""} for f in raw]}}
    out = sc.apply_guardrails(plan, "journal")
    assert _families(out["pages"][page]) == expected
    assert set(out["pages"]) == set(KNOWN_PAGE_KEYS)


def test_guardrails_variants():
    plan = {
        "pages": {
            "home": [{"family": "hero", "variant": "journal.intro"}, {"family": "story", "variant": "bogus"}],
            "about": [{"family": "hero", "variant": "editorial"}, {"family": "cta", "variant": "pop.marquee"}],
        }
    }
    out = sc.apply_guardrails(plan, "journal")
    assert out["pages"]["home"][0]["variant"] == "journal.editorial"  # home never opens with the intro
    assert out["pages"]["home"][1]["variant"] == "journal.letter"
    assert out["pages"]["about"][0]["variant"] == "journal.intro"
    assert out["pages"]["about"][-1]["variant"] == "journal.band"
    # Pure: the input is untouched; an empty plan is the recipe
    assert plan["pages"]["home"][0]["variant"] == "journal.intro"
    recipe = sc.apply_guardrails({}, "journal")["pages"]["home"]
    assert _families(recipe) == [f.partition(":")[0] for f in sections.manifest()["recipes"]["home"]]


def test_guardrails_keep_valid_briefs_only():
    brief = {"subject": "woman in a lunge", "action": "breathing", "setting": "studio", "person": "woman, 30s"}
    plan = {"pages": {"home": [{"family": "hero", "images": [{"slot": "image", **brief}, {"slot": "nope"}]}]}}
    hero = sc.apply_guardrails(plan, "journal")["pages"]["home"][0]
    assert hero["images"] == {"image": brief}


# ── DB: plan, fill, images, status ──────────────────────────────────────────


@pytest.fixture()
def styled(restore_public, monkeypatch):
    from apps.tenant_config.models import TenantConfig

    tenant = restore_public
    tenant.wizard_state = {
        "answers": {"niche": "yoga", "description": "Slow vinyasa for desk workers.", "style": "journal"},
        "keep": "me",
    }
    tenant.save(update_fields=["wizard_state"])
    with tenant_context(tenant):
        TenantConfig.objects.all().delete()
        TenantConfig.objects.create(
            brand_name="Maya Laurent", style="journal", pages={"faq": {"blocks": []}}, setup_flow={}
        )
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: True)
    connection.set_schema_to_public()
    return tenant


class FakeAI:
    """structured() stand-in: a plan for _SitePlan, generated valid copy for
    pages (from the spec in the user turn), with per-call overrides."""

    def __init__(self, plan=None, page_overrides=()):
        self.plan = plan
        self.page_overrides = list(page_overrides)  # callables(sections) -> sections, one per page call
        self.calls = []

    def __call__(self, *, system, user, output_model, model, max_tokens, label=None, effort=None):
        self.calls.append((label, user))
        if output_model is sc._SitePlan:
            if isinstance(self.plan, Exception):
                raise self.plan
            return sc._SitePlan.model_validate(self.plan or {}), Decimal("0"), model
        marker = "Page spec, in order: " if "Page spec" in user else "Field rules for these sections: "
        spec = json.loads(next(line for line in user.splitlines() if line.startswith(marker))[len(marker) :])
        out = [_valid_section(s) for s in spec]
        if self.page_overrides:
            out = self.page_overrides.pop(0)(out)
        return output_model.model_validate({"sections": out}), Decimal("0"), model


def _valid_section(spec):
    section = {"index": spec["index"], "family": spec["family"]}
    for name, field in spec["fields"].items():
        if field["type"] == "link":
            section[name] = "/about"
        elif field["type"] == "list":
            section[name] = [
                {sub: f"Item {n} {sub}"[: s.get("max", 40)] for sub, s in field["item"].items()}
                for n in range(field["min"])
            ]
        elif field["type"] == "html":
            section[name] = "<p>I teach slow vinyasa to people who sit all day.</p>"
        else:
            section[name] = f"{spec['family']} {name}"[: field["max"]]
    return section


@pytest.fixture()
def catalog(monkeypatch):
    """40 distinct catalog images per search; copy-on-use -> fake Photo."""
    queries = []

    def search(query, *, orientation=None, per_page=12, **_kw):
        queries.append((query, orientation))
        results = [
            curated_client.RemoteImage(
                asset_id=f"asset-{n}",
                title=f"Photo {n}",
                description=f"woman practising yoga {n}",
                tags=[],
                width=800,
                height=1000,
                preview_url="",
                web_url="",
            )
            for n in range(40)
        ]
        return curated_client.SearchPage(results=results, page=1, has_next=False)

    def cache_remote_image(image):
        return SimpleNamespace(pk=uuid5(NAMESPACE_URL, image.asset_id))

    monkeypatch.setattr(sc.curated_client, "search", search)
    monkeypatch.setattr(sc.curated_cache, "cache_remote_image", cache_remote_image)
    return queries


def _config(tenant):
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        return TenantConfig.objects.first()


def _photo_ids(blocks):
    ids = []
    for block in blocks:
        for value in block.values():
            if isinstance(value, dict) and value.get("photo_id"):
                ids.append(value["photo_id"])
            if isinstance(value, list):
                images = [item.get("image") for item in value if isinstance(item, dict)]
                ids += [image["photo_id"] for image in images if isinstance(image, dict) and image["photo_id"]]
    return ids


@pytest.mark.django_db
def test_plan_falls_back_on_ai_error(styled, monkeypatch):
    fake = FakeAI(plan=core_ai.AiError("hub down"))
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    plan = sc.plan_site(styled)
    assert plan["source"] == "fallback" and plan["style"] == "journal"
    recipe = sc.apply_guardrails({}, "journal")["pages"]
    assert {k: [(e["family"], e["variant"]) for e in v] for k, v in plan["pages"].items()} == {
        k: [(e["family"], e["variant"]) for e in v] for k, v in recipe.items()
    }
    hero = plan["pages"]["home"][0]
    assert hero["images"]["image"]["subject"].startswith("yoga ")
    assert len(plan["course_ideas"]) == 3 and len(plan["post_ideas"]) == 3
    styled.refresh_from_db()
    assert styled.wizard_state["site_plan"]["source"] == "fallback"
    assert styled.wizard_state["keep"] == "me"  # other wizard_state keys survive


@pytest.mark.django_db
def test_plan_uses_ai_then_caches(styled, monkeypatch):
    brief = {"slot": "image", "subject": "woman in a low lunge", "action": "", "setting": "", "person": "woman, 40s"}
    fake = FakeAI(
        plan={
            "voice": "calm and dry",
            "audience": "desk workers with stiff backs",
            "pages": [{"page": "home", "sections": [{"family": "hero", "variant": "editorial", "images": [brief]}]}],
            "course_ideas": ["Desk-back reset", "Ten-minute flows"],
        }
    )
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    plan = sc.plan_site(styled)
    assert plan["source"] == "ai" and plan["voice"] == "calm and dry"
    assert _families(plan["pages"]["home"]) == ["hero", "cta"]
    assert plan["pages"]["home"][0]["images"]["image"]["subject"] == "woman in a low lunge"
    assert plan["course_ideas"] == ["Desk-back reset", "Ten-minute flows"]
    assert plan["event_ideas"]  # defaults fill what the model left out
    assert fake.calls[0][0] == "contentor:compose-plan"
    sc.plan_site(styled)
    assert len(fake.calls) == 1  # cached
    # A style switch re-guards the cached plan instead of re-asking the model
    from apps.tenant_config.models import TenantConfig

    with tenant_context(styled):
        TenantConfig.objects.update(style="pop")
    switched = sc.plan_site(styled)
    assert len(fake.calls) == 1 and switched["style"] == "pop"
    assert switched["pages"]["home"][0]["variant"] == "pop.bigname"


@pytest.mark.django_db
def test_compose_page_happy_path(styled, monkeypatch, catalog):
    fake = FakeAI(plan=core_ai.AiError("no plan"))
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    blocks = sc.compose_page(styled, "home", instruction="mention mornings")

    assert [b["type"] for b in blocks][0] == "section.hero"
    hero = blocks[0]
    assert hero["headline"] == "hero headline"  # model copy, not fallback
    assert hero["ctaHref"] == "/about"
    for block in blocks:
        assert sections.clean_section_block(block) == block
        assert not sc._problems(sections.family_of(block["type"]), block, strict=False)
    assert hero["image"]["photo_id"] and hero["image"]["alt"].startswith("woman practising yoga")
    moments = next(b for b in blocks if b["type"] == "section.moments")
    assert all(p["image"]["photo_id"] for p in moments["photos"])
    ids = _photo_ids(blocks)
    assert len(ids) == len(set(ids))  # no photo twice on the page
    # Queries carry the niche, the brief and the style's photo words; orientation from the aspect
    assert any("yoga" in q and "soft natural window light" in q for q, _ in catalog)
    assert {o for _, o in catalog} >= {"portrait", "square", "landscape"}

    page_call = next(user for label, user in fake.calls if label == "contentor:compose-page")
    assert "mention mornings" in page_call and "<<COACH_DATA" in page_call

    config = _config(styled)
    assert config.pages["home"]["blocks"] == blocks
    assert config.pages["faq"] == {"blocks": []}  # other pages untouched
    styled.refresh_from_db()
    assert len(styled.wizard_state["site_plan"]["used_assets"]["home"]) == len(ids)


@pytest.mark.django_db
def test_assets_are_not_reused_across_pages(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    home = sc.compose_page(styled, "home")
    about = sc.compose_page(styled, "about")
    ids = _photo_ids(home) + _photo_ids(about)
    assert len(ids) == len(set(ids)) > 10
    # Recomposing a page may reuse its own photos, never another page's
    again = sc.compose_page(styled, "about")
    assert not set(_photo_ids(again)) & set(_photo_ids(home))


@pytest.mark.django_db
def test_repair_fixes_failing_fields(styled, monkeypatch, catalog):
    def too_long(sections_):
        sections_[0]["headline"] = "word " * 30
        sections_[1]["heading"] = "A journey worth taking"
        return sections_

    def repaired(sections_):
        for s in sections_:
            if s["index"] == 0:
                s["headline"] = "Breathe out before the meeting"
            if s["index"] == 1:
                s["heading"] = "Why I teach slow flow"
        return sections_

    fake = FakeAI(plan=core_ai.AiError("no plan"), page_overrides=[too_long, repaired])
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    blocks = sc.compose_page(styled, "home")
    assert blocks[0]["headline"] == "Breathe out before the meeting"
    assert blocks[1]["heading"] == "Why I teach slow flow"
    repair_call = [u for label, u in fake.calls if label == "contentor:compose-page"][1]
    assert "Repair pass" in repair_call and "max 70" in repair_call and "journey" in repair_call


@pytest.mark.django_db
def test_section_falls_back_when_repair_fails(styled, monkeypatch, catalog):
    def too_long(sections_):
        sections_[0]["headline"] = "word " * 30
        return sections_

    fake = FakeAI(plan=core_ai.AiError("no plan"), page_overrides=[too_long, too_long])
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    blocks = sc.compose_page(styled, "home")
    ctx = sc._ctx("yoga", "Maya Laurent", "Slow vinyasa for desk workers.")
    fallback = sc.fallback_fields("hero", "home", "journal.editorial", ctx)
    assert blocks[0]["headline"] == fallback["headline"]
    assert blocks[0]["kicker"] == fallback["kicker"]
    assert blocks[1]["heading"] == "story heading"  # other sections keep the model's copy


@pytest.mark.django_db
def test_no_ai_means_fallback_copy_and_real_photos(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    blocks = sc.compose_page(styled, "about")
    assert blocks[0]["headline"] == "Hello, I'm Maya"
    assert _photo_ids(blocks)


@pytest.mark.django_db
def test_image_failure_leaves_slot_empty(styled, monkeypatch):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))

    def broken(*_a, **_kw):
        raise curated_client.CuratedImageError("the photo library is unavailable right now")

    monkeypatch.setattr(sc.curated_client, "search", broken)
    blocks = sc.compose_page(styled, "home")
    assert blocks[0]["image"] == {"url": None, "photo_id": None, "alt": None}
    assert not _photo_ids(blocks)


@pytest.mark.django_db
def test_build_status_and_claims(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    sc.set_build_status(styled, "home", "building")
    flow = _config(styled).setup_flow
    assert flow["status"] == "done"  # {} meant done; kept explicit
    assert flow["page_builds"]["home"]["status"] == "building"

    assert sc.build_page(styled, "home") is False  # fresh "building" elsewhere -> skipped
    assert sc.build_page(styled, "home", skip_if_building=False) is True  # an explicit request runs
    assert _config(styled).setup_flow["page_builds"]["home"]["status"] == "ready"

    monkeypatch.setattr(sc, "compose_page", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    assert sc.build_page(styled, "about") is False
    assert _config(styled).setup_flow["page_builds"]["about"]["status"] == "failed"
    with pytest.raises(ValueError):
        sc.set_build_status(styled, "home", "weird")


@pytest.mark.django_db
def test_a_running_build_reports_its_stage(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    seen = []
    fill, attach = sc._fill_page, sc._attach_images

    def stage():
        return ((_config(styled).setup_flow or {}).get("page_builds") or {}).get("home", {}).get("stage")

    def fill_page(*args, **kwargs):
        seen.append(stage())
        return fill(*args, **kwargs)

    def attach_images(*args, **kwargs):
        seen.append(stage())
        return attach(*args, **kwargs)

    monkeypatch.setattr(sc, "_fill_page", fill_page)
    monkeypatch.setattr(sc, "_attach_images", attach_images)
    assert sc.build_page(styled, "home", skip_if_building=False) is True
    assert seen == ["copy", "photos"]
    assert "stage" not in _config(styled).setup_flow["page_builds"]["home"]  # ready clears it

    seen.clear()
    sc.compose_page(styled, "home")  # not building: nothing to report
    assert seen == [None, None]


@pytest.mark.django_db
def test_compose_site_builds_pages_in_order_and_pricing_only_with_plans(styled, monkeypatch):
    built = []
    monkeypatch.setattr(sc, "plan_site", lambda tenant, **kw: {})
    monkeypatch.setattr(sc, "build_page", lambda tenant, page, **kw: built.append(page))
    sc.compose_site(styled)
    assert built == ["home", "about", "courses", "faq", "contact"]

    from apps.billing.models import SubscriptionPlan

    with tenant_context(styled):
        SubscriptionPlan.objects.create(name="Monthly", price=20)
    built.clear()
    sc.compose_site(styled)
    assert built[-1] == "pricing"


def test_site_style_for():
    assert sc.site_style_for({"niche": "yoga"}) == ""  # predates the Style step: legacy
    assert sc.site_style_for({"niche": "yoga", "style": "pop"}) == "pop"
    assert sc.site_style_for({"niche": "yoga", "style": "nope"}) == "journal"


# ── provisioning ────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_provisioning_styled_path(restore_public, monkeypatch):
    from apps.blog.models import BlogPost
    from apps.core.models import Tenant
    from apps.core.tasks import compose_site_task, provision_tenant
    from apps.courses.models import Course
    from apps.tenant_config.models import TenantConfig

    enqueued = []
    monkeypatch.setattr(compose_site_task, "delay", lambda tenant_id: enqueued.append(tenant_id))
    connection.set_schema_to_public()
    tenant = Tenant.objects.create(
        schema_name="prov_styled",
        name="Maya Laurent",
        slug="prov-styled",
        subdomain="prov-styled",
        owner_email="prov@x.com",
        provisioning_status="pending",
        template_niche="yoga",
        template_seed_status="seeding",
        wizard_state={"answers": {"niche": "yoga", "style": "journal", "description": "Slow vinyasa.", "goals": []}},
    )
    try:
        provision_tenant.apply(args=[tenant.id, "prov@x.com", "Maya", "yoga"])
        tenant.refresh_from_db()
        assert tenant.provisioning_status == "ready"
        assert tenant.template_seed_status == "skipped"
        assert "ai_blog_status" not in tenant.wizard_state  # no starter post
        assert enqueued == [tenant.id]
        with tenant_context(tenant):
            config = TenantConfig.objects.first()
            assert config.style == "journal"
            assert config.setup_flow["status"] == "active" and config.setup_flow["step"] == "course"
            assert config.setup_flow["page_builds"] == {} and config.setup_flow["published"] is False
            assert set(config.pages) == set(KNOWN_PAGE_KEYS)
            assert all(b["type"].startswith("section.") for p in config.pages.values() for b in p["blocks"])
            assert not Course.objects.exists()
            assert not BlogPost.objects.exists()
    finally:
        connection.set_schema_to_public()
        Tenant.objects.get(pk=tenant.pk).delete(force_drop=True)


def _remote(asset_id, text):
    return curated_client.RemoteImage(
        asset_id=asset_id, title=text, description=text, tags=[], width=800, height=600, preview_url="", web_url=""
    )


def test_a_boxing_coach_never_gets_a_pole_dance_photo(monkeypatch):
    results = [
        _remote("pole", "woman on a dance pole in a studio"),
        _remote("gym", "coach holding pads in a gym"),
        _remote("box", "boxer wrapping hands, boxing gym"),
    ]
    monkeypatch.setattr(
        sc.curated_client, "search", lambda *a, **k: curated_client.SearchPage(results=results, page=1, has_next=False)
    )
    monkeypatch.setattr(sc.curated_cache, "cache_remote_image", lambda image: SimpleNamespace(pk=image.asset_id))
    ctx = sc._ctx("general", "Iron Fist", "Boxing for beginners", "boxing")
    image, _ = sc._find_photo(["boxing coach"], "landscape", set(), ctx)
    assert image.asset_id == "box"  # names the subject: first
    image, _ = sc._find_photo(["boxing coach"], "landscape", {"box"}, ctx)
    assert image.asset_id == "gym"  # neutral is fine; the pole photo never is
    image, _ = sc._find_photo(["boxing coach"], "landscape", {"box", "gym"}, ctx)
    assert image.asset_id in {"box", "gym"}


def test_subject_is_what_the_coach_teaches_when_the_niche_is_unknown():
    from apps.tenant_config import interview_brief

    assert interview_brief.subject_of({"niche": "fitness", "teaches": "Boxing for women"}) == "boxing"
    assert interview_brief.subject_of({"niche": "pole_dance", "teaches": "Pole dance"}) == "pole dance"
    assert interview_brief.subject_of({"niche": "general", "teaches": "Life coaching"}) == "life coaching"
    assert interview_brief.subject_of({"niche": "yoga"}) == "yoga"
    assert interview_brief.niche_for("Boxing for beginners") == "fitness"  # its looks and copy
    assert sc._ctx("general", "Iron Fist", "", "boxing")["topic"] == "boxing"


def test_courses_and_events_pages_open_in_the_rows_layout():
    for style_id in ("journal", "kinetic", "grid", "pop"):
        plan = sc.apply_guardrails(
            {"pages": {"courses": [{"family": "hero"}, {"family": "courseShowcase", "variant": "x"}]}}, style_id
        )
        showcase = next(e for e in plan["pages"]["courses"] if e["family"] == "courseShowcase")
        assert showcase["variant"] == f"{style_id}.rows"
        events = next(e for e in plan["pages"]["events"] if e["family"] == "events")
        assert events["variant"] == f"{style_id}.rows"
        home = next(e for e in plan["pages"]["home"] if e["family"] == "courseShowcase")
        assert home["variant"] != f"{style_id}.rows"  # home keeps the style's own showcase
