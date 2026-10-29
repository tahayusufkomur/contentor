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
            assert not sc._hard(sc._problems(sections.family_of(block["type"]), block, page_key=page))
            for name in sections.image_fields(sections.family_of(block["type"])):
                assert block[name] == {"url": None, "photo_id": None, "alt": None}


def test_skeleton_copy_is_honest_and_in_voice():
    solo = sc.skeleton_pages("journal", niche="yoga", brand_name="Maya Laurent", description="")
    studio = sc.skeleton_pages("journal", niche="yoga", brand_name="Flow Studio", description="")
    text = json.dumps(solo) + json.dumps(studio)
    assert "!" not in text
    assert sc._banned(text) is None
    story = next(b for b in solo["home"]["blocks"] if b["type"] == "section.story")
    assert story["heading"] == "Why I teach yoga" and "signature" not in story  # signed by compose_page, from the owner
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


@pytest.mark.parametrize(
    ("brand", "teachers", "expected"),
    [
        ("G's Face Yoga Studio", "solo", "I"),  # reads as a business; her answer wins
        ("G's Face Yoga Studio", "solo_for_now", "I"),
        ("Maya Laurent", "several", "we"),  # reads as a person; her answer wins
        ("G's Face Yoga Studio", None, "we"),  # no answer: the guess
        ("Maya Laurent", None, "I"),
    ],
)
def test_speaker_follows_who_students_learn_from(brand, teachers, expected):
    said = sc.speaker(brand, "", {"teachers": teachers} if teachers else {})
    assert said == expected
    story = sc.fallback_fields("story", "about", "journal.letter", sc._ctx("face_yoga", brand, said=said))
    assert story["heading"] == f"Why {expected} teach face yoga"


def _families(entries):
    return [e["family"] for e in entries]


@pytest.mark.parametrize(
    ("page", "raw", "expected"),
    [
        # hero moved first; unknown family replaced by the style's own recipe entry at that position
        ("home", ["story", "hero", "nonsense", "cta"], ["hero", "story", "philosophy", "cta"]),
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
    assert out["pages"]["home"][0]["variant"] == "journal.cover"  # home never opens with the intro: the default hero
    assert out["pages"]["home"][1]["variant"] == "journal.letter"
    assert out["pages"]["about"][0]["variant"] == "journal.intro"
    assert out["pages"]["about"][-1]["variant"] == "journal.band"
    # Pure: the input is untouched; an empty plan is the recipe
    assert plan["pages"]["home"][0]["variant"] == "journal.intro"
    recipe = sc.apply_guardrails({}, "journal")["pages"]["home"]
    assert _families(recipe) == [f.partition(":")[0] for f in sections.recipes("journal")["home"]]


@pytest.mark.parametrize("style_id", ENABLED)
def test_every_styles_home_order_survives_the_guardrails(style_id):
    """A style's own home order is the page a coach gets: the guardrails
    (hero first, cta last, no run of three photo-led sections) must not reshuffle it."""
    home = sc.apply_guardrails({}, style_id)["pages"]["home"]
    assert _families(home) == [f.partition(":")[0] for f in sections.recipes(style_id)["home"]]
    skeleton = sc.skeleton_pages(style_id, niche="yoga", brand_name="Flow Studio")
    assert [sections.family_of(b["type"]) for b in skeleton["home"]["blocks"]] == _families(home)


def test_no_two_styles_share_a_hero_layout_and_a_home_order():
    seen = {}
    for sid, s in sections.enabled_styles().items():
        key = (s["heroLayout"], tuple(f.partition(":")[0] for f in sections.recipes(sid)["home"]))
        assert key not in seen, f"{sid} and {seen[key]} share hero layout {key[0]} and home order"
        seen[key] = sid


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

    def __call__(self, *, system, user, output_model, model, max_tokens, language, label=None, effort=None):
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

    def search(query, *, orientation=None, aspect_ratio=None, per_page=12, **_kw):
        queries.append((query, aspect_ratio or orientation))
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

    def cache_remote_image(image, **kwargs):
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


def _plan_slots(style_id):
    """family -> the photo slots the planner is asked to brief for this style."""
    user = sc._plan_user_turn({"niche": "yoga"}, style_id)
    line = next(line for line in user.splitlines() if line.startswith("Families in this style"))
    return {family: list(spec["photoSlots"]) for family, spec in json.loads(line.partition(": ")[2]).items()}


def test_plan_asks_only_for_photos_the_default_layouts_show():
    """Every brief is output the planner must fit in its token budget: no slot a layout never renders."""
    assert _plan_slots("workshop")["hero"] == ["image", "image2", "image3", "image4"]  # the collage shows four
    assert _plan_slots("workshop")["story"] == []  # a letter has no photo
    assert _plan_slots("trail")["hero"] == ["image"]  # fullbleed shows one
    assert _plan_slots("sanctum")["story"] == ["image"]  # a pull-quote keeps the portrait only
    assert _plan_slots("journal")["hero"] == ["image", "image2"]
    assert _plan_slots("ledger")["story"] == ["image", "image2"]  # the split story shows both


@pytest.mark.django_db
def test_a_second_plan_request_waits_for_the_first_instead_of_paying_again(styled, monkeypatch):
    """2026-10-12: two page builds started together and each ran the two-minute plan."""
    from django.core.cache import cache

    fake = FakeAI(plan={"pages": []})
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    lock = f"site-plan:writing:{styled.schema_name}"
    cache.set(lock, 1, 60)  # another worker is writing it

    def other_run_lands(_seconds):
        sc._store_plan(styled, {**sc.apply_guardrails({}, "journal"), "style": "journal", "voice": "theirs"})
        cache.delete(lock)

    monkeypatch.setattr(sc.time, "sleep", other_run_lands)
    plan = sc.plan_site(styled)
    assert plan["voice"] == "theirs" and fake.calls == [] and cache.get(lock) is None
    cache.set(lock, 1, 60)  # a writer that never stored one (it failed): this request writes it
    styled.wizard_state = {**styled.wizard_state, "site_plan": {}}
    type(styled).objects.filter(pk=styled.pk).update(wizard_state=styled.wizard_state)
    monkeypatch.setattr(sc.time, "sleep", lambda _s: cache.delete(lock))
    assert sc.plan_site(styled)["source"] == "ai" and len(fake.calls) == 1


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
    assert switched["pages"]["home"][0]["variant"] == "pop.cluster"  # the style's default hero


@pytest.mark.django_db
def test_compose_page_happy_path(styled, monkeypatch, catalog):
    fake = FakeAI(plan=core_ai.AiError("no plan"))
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    blocks = sc.compose_page(styled, "home", instruction="mention mornings")

    assert [b["type"] for b in blocks][0] == "section.hero"
    hero = blocks[0]
    assert hero["headline"] == "hero headline"  # model copy, not fallback
    assert hero["ctaHref"] == "/courses"  # the model said /about; the home hero leads to the offer
    for block in blocks:
        assert sections.clean_section_block(block) == block
        assert not sc._problems(sections.family_of(block["type"]), block, strict=False, page_key="home")
    assert hero["image"]["photo_id"] and hero["image"]["alt"].startswith("woman practising yoga")
    moments = next(b for b in blocks if b["type"] == "section.moments")
    assert all(p["image"]["photo_id"] for p in moments["photos"])
    ids = _photo_ids(blocks)
    assert len(ids) == len(set(ids))  # no photo twice on the page
    # One shared topic pool per orientation, not a search per slot: ~11 slots, at most a few searches
    assert all(q == "yoga" for q, _ in catalog)
    assert {o for _, o in catalog} <= {"landscape", "portrait", "square"}
    assert len(catalog) <= 3

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


def test_plan_prompt_names_one_protagonist():
    assert "no two photos look alike" not in sc.PLAN_SYSTEM_PROMPT
    assert "One person stands for the coach" in sc.PLAN_SYSTEM_PROMPT


def test_generic_briefs_show_hands_not_a_second_face():
    ctx = sc._ctx("yoga", "Maya Laurent")
    assert (
        sc._generic_brief("story", "image2", ctx, "about")["subject"]
        == "yoga instructor's hands demonstrating, close-up"
    )
    assert sc._generic_brief("contact", "image", ctx, "contact")["subject"] == "yoga hands during practice, close-up"


@pytest.mark.django_db
def test_the_fallback_plan_briefs_one_coach_portrait_per_page(styled, monkeypatch):
    """No AI plan (often the case in prod): hero.image is the coach on home, story.image on every other page."""
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    plan = sc.plan_site(styled)

    def subject(page, family, slot="image"):
        entry = next(e for e in plan["pages"][page] if e["family"] == family)
        return entry["images"][slot]["subject"]

    assert "instructor" in subject("home", "hero") and "instructor" not in subject("home", "story")
    assert "portrait of the instructor" in subject("about", "story")
    assert "instructor" not in subject("about", "hero") and "students" in subject("about", "hero")
    for page, entries in plan["pages"].items():  # whatever the style's recipe holds
        faces = [
            (e["family"], slot)
            for e in entries
            for slot, brief in e["images"].items()
            if "instructor" in brief["subject"] and "hands" not in brief["subject"]
        ]
        assert len(faces) <= 1, (page, faces)


@pytest.mark.django_db
def test_peer_assets_reads_same_niche_tenants_only(styled):
    from apps.core.models import Tenant

    def ws(niche, ids):
        return {"answers": {"niche": niche}, "site_plan": {"used_assets": {"home": ids}}}

    def peer(schema, wizard_state, **kw):
        return Tenant(
            schema_name=schema,
            name=schema,
            slug=schema,
            subdomain=schema,
            owner_email=f"{schema}@example.com",
            wizard_state=wizard_state,
            **kw,
        )

    Tenant.objects.bulk_create(  # bulk_create skips save(): no schema is created
        [
            peer("peer_same", ws("yoga", ["a1", "own:x"])),
            peer("peer_other", ws("cooking", ["b1"])),
            # no niche answer: the niche the template was seeded with counts
            peer("peer_seeded", {"site_plan": {"used_assets": {"about": ["a2"]}}}, template_niche="yoga"),
            peer("peer_none", {}),
        ]
    )
    assert sc._peer_assets(styled, "yoga") == frozenset({"a1", "a2"})  # not her own, nor the cooking coach's
    assert sc._peer_assets(styled, "cooking") == frozenset({"b1"})


def _catalog_pool():
    """Every asset id the `catalog` fixture's search returns (the same for every query)."""
    pool = [i.asset_id for i in sc.curated_client.search("yoga").results]
    assert len(pool) > 20  # home alone needs a dozen; the cases below take 5, all and all but 2 of it
    return pool


@pytest.mark.django_db
def test_a_peer_photo_is_used_only_when_nothing_else_fits(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    pool = _catalog_pool()

    def used(page):
        styled.refresh_from_db()
        return set(styled.wizard_state["site_plan"]["used_assets"][page])

    monkeypatch.setattr(sc, "_peer_assets", lambda tenant, niche: frozenset())
    baseline = len(_photo_ids(sc.compose_page(styled, "about")))
    assert baseline > 3

    monkeypatch.setattr(sc, "_peer_assets", lambda tenant, niche: frozenset(pool[:5]))
    home = _photo_ids(sc.compose_page(styled, "home"))
    assert not used("home") & set(pool[:5])  # plenty else fits: a peer's face is left alone
    assert len(home) == len(used("home")) > 10 and len(home) == len(set(home))

    monkeypatch.setattr(sc, "_peer_assets", lambda tenant, niche: frozenset(pool))
    about = _photo_ids(sc.compose_page(styled, "about"))  # every photo in the niche is a peer's
    assert len(about) == baseline  # still, no empty slot
    assert len(about) == len(set(about))  # and each slot its own photo, not one repeated
    assert used("about") <= set(pool)


@pytest.mark.django_db
def test_free_photos_go_first_and_a_peers_fill_the_rest(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    pool = _catalog_pool()
    monkeypatch.setattr(sc, "_peer_assets", lambda tenant, niche: frozenset(pool[:-2]))
    home = _photo_ids(sc.compose_page(styled, "home"))  # a dozen slots: the peers' photos must each go once
    styled.refresh_from_db()
    used = set(styled.wizard_state["site_plan"]["used_assets"]["home"])
    assert set(pool[-2:]) <= used  # the two nobody shows go first
    assert len(home) == len(used) > 10 and len(home) == len(set(home))  # peers' photos fill the rest, each once


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
    assert "Repair pass" in repair_call and "max 36" in repair_call and "journey" in repair_call


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
    monkeypatch.setattr(sc, "_coach_first_name", lambda tenant: "Maya")
    blocks = sc.compose_page(styled, "about")
    assert blocks[0]["headline"] == "Hello, I'm Maya"
    assert _photo_ids(blocks)
    monkeypatch.setattr(sc, "_coach_first_name", lambda tenant: "")
    assert sc.compose_page(styled, "about")[0]["headline"] == "Behind Maya Laurent"  # no owner name: no "Hello, I'm"


@pytest.mark.django_db
def test_home_hero_headline_is_capped_and_repaired(styled, monkeypatch, catalog):
    def long(s):
        s[0]["headline"] = "Strength that feels like ease every single day"  # 48
        return s

    def short(s):
        for x in s:
            if x["index"] == 0:
                x["headline"] = "Strong, calm, unhurried"
        return s

    fake = FakeAI(plan=core_ai.AiError("no plan"), page_overrides=[long, short])
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    blocks = sc.compose_page(styled, "home")
    assert blocks[0]["headline"] == "Strong, calm, unhurried"
    repair = [u for label, u in fake.calls if label == "contentor:compose-page"][1]
    assert "max 36" in repair


@pytest.mark.django_db
def test_home_hero_has_no_meta_or_second_button(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    hero = sc.compose_page(styled, "home")[0]
    assert not hero.get("meta") and not hero.get("secondaryLabel") and not hero.get("secondaryHref")


def test_inner_hero_keeps_seventy_characters():
    assert sc._writable("hero", "about")["headline"]["max"] == 70
    assert sc._writable("hero", "home")["headline"]["max"] == 36
    assert {"meta", "secondaryLabel", "secondaryHref"} <= set(sc._writable("hero", "about"))
    assert not {"meta", "secondaryLabel", "secondaryHref"} & set(sc._writable("hero", "home"))


def test_home_lists_are_capped_and_other_pages_keep_the_manifest():
    for family, (field, cap) in sc.HOME_LIST_MAX.items():
        assert sc._writable(family, "home")[field]["max"] == cap
        assert sc._writable(family, "about")[field]["max"] > cap
        assert sc._writable(family)[field]["max"] > cap


def test_one_at_a_time_cadence_is_banned():
    assert sc._banned("Glow from within, one calm minute at a time")
    assert not sc._banned("Take it one step at a time")  # no comma clause


@pytest.mark.django_db
def test_kickers_capped_at_two_besides_the_hero(styled, monkeypatch, catalog):
    def kick(s):
        for x in s:
            x["kicker"] = "Label"
        return s

    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan"), page_overrides=[kick]))
    blocks = sc.compose_page(styled, "home")
    assert blocks[0]["kicker"]
    assert sum(1 for b in blocks[1:] if b.get("kicker")) <= sc.MAX_KICKERS_PER_PAGE


@pytest.mark.django_db
def test_home_hero_button_leads_to_the_offer(styled, monkeypatch, catalog):
    def about(s):
        s[0]["ctaHref"], s[0]["ctaLabel"] = "/about", "Meet us"
        return s

    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan"), page_overrides=[about]))
    hero = sc.compose_page(styled, "home")[0]
    assert hero["ctaHref"] in ("/courses", "/events") and hero["ctaLabel"] != "Meet us"


@pytest.mark.django_db
def test_home_buttons_of_a_coach_with_nothing_to_browse_ask_instead(styled, monkeypatch, catalog):
    """No courses and no classes: ctx["primary"] is /about, and the home hero and closing buttons
    become Contact: never empty, never About, never the home page itself."""
    styled.wizard_state["answers"]["offers"] = ["articles"]
    styled.save(update_fields=["wizard_state"])
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    blocks = sc.compose_page(styled, "home")
    buttons = [b for b in blocks if b["type"] in ("section.hero", "section.cta")]
    assert len(buttons) == 2
    assert all(b["ctaHref"] == "/contact" and b["ctaLabel"] for b in buttons)
    # the fallback copy (no AI) lands in the same place
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    buttons = [b for b in sc.compose_page(styled, "home") if b["type"] in ("section.hero", "section.cta")]
    assert all(b["ctaHref"] == "/contact" and b["ctaLabel"] for b in buttons)


def test_pin_home_buttons():
    courses = sc._ctx("yoga", "Maya Laurent", "")
    live = sc._ctx("yoga", "Maya Laurent", "", links=sc.coach_links({"offers": ["live"]}))
    nothing = sc._ctx("yoga", "Maya Laurent", "", links=sc.coach_links({"offers": ["articles"]}))
    assert nothing["primary"] == "/about"

    fields = {"ctaHref": "/contact", "ctaLabel": "Say hi"}
    sc._pin_home_buttons(fields, courses)
    assert fields == {"ctaHref": "/courses", "ctaLabel": "Browse the courses"}
    fields = {"ctaHref": "/events", "ctaLabel": ""}  # right page, no label: the button would not show
    sc._pin_home_buttons(fields, live)
    assert fields == {"ctaHref": "/events", "ctaLabel": "See the sessions"}
    fields = {"ctaHref": "/events", "ctaLabel": "Join a class"}  # her own words stay when the link is right
    sc._pin_home_buttons(fields, live)
    assert fields["ctaLabel"] == "Join a class"
    fields = {"ctaHref": "/about", "ctaLabel": "Meet us"}
    sc._pin_home_buttons(fields, nothing)
    assert fields == {"ctaHref": "/contact", "ctaLabel": "Get in touch"}
    fields = {"ctaHref": "/faq", "ctaLabel": "Read the FAQ"}  # not About: left alone
    sc._pin_home_buttons(fields, nothing)
    assert fields["ctaHref"] == "/faq"
    fields = {"ctaHref": "/contact", "ctaLabel": ""}  # already Contact, no label: the button would not show
    sc._pin_home_buttons(fields, nothing)
    assert fields == {"ctaHref": "/contact", "ctaLabel": "Get in touch"}
    fields = {"ctaHref": "/contact", "ctaLabel": "Say hi"}  # her own words stay when the link is right
    sc._pin_home_buttons(fields, nothing)
    assert fields["ctaLabel"] == "Say hi"


@pytest.mark.django_db
def test_home_lists_are_capped_at_three(styled, monkeypatch, catalog):
    """The home recipe has no events block, so the plan adds one: a coach with nine classes shows three."""
    plan = sc.apply_guardrails(
        {"pages": {"home": [{"family": f} for f in ("hero", "story", "courseShowcase", "events", "cta")]}}, "journal"
    )
    styled.wizard_state = {**styled.wizard_state, "site_plan": {**plan, "style": "journal"}}
    styled.save(update_fields=["wizard_state"])
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    blocks = sc.compose_page(styled, "home")
    lists = [b for b in blocks if b["type"] in ("section.courseShowcase", "section.events")]
    assert {b["type"] for b in lists} == {"section.courseShowcase", "section.events"}
    assert all(b["limit"] == "3" for b in lists)
    # The events page is untouched: no limit means every class.
    events_page = sc.compose_page(styled, "events")
    assert [b.get("limit", "all") for b in events_page if b["type"] == "section.events"] == ["all"]


def test_home_courses_never_use_the_rows_layout():
    """`rows` is the courses page's catalogue and shows six courses whatever the block's limit says,
    so a home plan that picks it lands on the style's own layout; the courses page keeps rows."""
    plan = {"pages": {p: [{"family": "courseShowcase", "variant": "rows"}] for p in ("home", "courses")}}
    pages = sc.apply_guardrails(plan, "journal")["pages"]
    assert [e["variant"] for e in pages["home"] if e["family"] == "courseShowcase"] == ["journal.issue"]
    assert [e["variant"] for e in pages["courses"] if e["family"] == "courseShowcase"] == ["journal.rows"]


@pytest.mark.django_db
def test_home_plan_with_rows_composes_a_capped_non_rows_block(styled, monkeypatch, catalog):
    """A plan cached before the guard existed still picks rows on home: compose_page moves it too."""
    plan = sc.apply_guardrails(
        {"pages": {"home": [{"family": f} for f in ("hero", "courseShowcase", "cta")]}}, "journal"
    )
    for entry in plan["pages"]["home"]:
        if entry["family"] == "courseShowcase":
            entry["variant"] = "journal.rows"
    styled.wizard_state = {**styled.wizard_state, "site_plan": {**plan, "style": "journal"}}
    styled.save(update_fields=["wizard_state"])
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    (course,) = [b for b in sc.compose_page(styled, "home") if b["type"] == "section.courseShowcase"]
    assert course["variant"] == "journal.issue" and course["limit"] == "3"
    (course,) = [b for b in sc.compose_page(styled, "courses") if b["type"] == "section.courseShowcase"]
    assert course["variant"] == "journal.rows"


SECOND_HEROES = [
    (style_id, name) for style_id in ENABLED for name in sections.variants(style_id, "hero")[1:] if name != "intro"
]


@pytest.mark.parametrize(("style_id", "second"), SECOND_HEROES)
def test_home_hero_is_pinned_to_the_styles_first_phone_first_variant(style_id, second):
    """The second home heroes are still text-first on a phone (R16): a plan that names one gets the first.
    Inner pages keep the compact intro."""
    first = f"{style_id}.{sections.variants(style_id, 'hero')[0]}"
    plan = {"pages": {p: [{"family": "hero", "variant": second}, {"family": "cta"}] for p in ("home", "about")}}
    pages = sc.apply_guardrails(plan, style_id)["pages"]
    assert pages["home"][0]["variant"] == first
    assert pages["about"][0]["variant"] == f"{style_id}.intro"
    # A plan cached before the pin existed: pure, a new list, the entries stay as they were.
    cached = [{"family": "hero", "variant": f"{style_id}.{second}", "images": {}}, {"family": "cta", "variant": None}]
    pinned = sc._home_pins(style_id, "home", cached)
    assert pinned[0]["variant"] == first and cached[0]["variant"] == f"{style_id}.{second}"
    assert sc._home_pins(style_id, "about", cached)[0]["variant"] == f"{style_id}.{second}"  # inner pages: untouched


def test_the_second_home_heroes_exist():
    assert (
        len(SECOND_HEROES) == 11
    )  # dojo, encore, grid, journal, maison, pop, sanctum, sprout, studiofloor, trail, workshop


@pytest.mark.django_db
def test_a_cached_plan_with_a_second_home_hero_composes_with_the_first(styled, monkeypatch, catalog):
    plan = sc.apply_guardrails({"pages": {"home": [{"family": f} for f in ("hero", "story", "cta")]}}, "journal")
    plan["pages"]["home"][0]["variant"] = "journal.editorial"
    styled.wizard_state = {**styled.wizard_state, "site_plan": {**plan, "style": "journal"}}
    styled.save(update_fields=["wizard_state"])
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    assert sc.compose_page(styled, "home")[0]["variant"] == "journal.cover"


def test_fallback_greeting_uses_the_owners_first_name_never_the_brands_first_word():
    """ "Kind Mornings" reads like a name but is a brand: no-AI copy must not say "I'm Kind"."""
    for first, kicker, headline in (
        ("Maya", "Hello, I'm Maya", "Hello, I'm Maya"),
        ("", "Hello", "Behind Kind Mornings"),
    ):
        ctx = sc._ctx("yoga", "Kind Mornings", "", first_name=first)
        assert sc.fallback_fields("story", "home", "journal.letter", ctx)["kicker"] == kicker
        assert sc.fallback_fields("hero", "about", "journal.intro", ctx)["headline"] == headline
    pages = sc.skeleton_pages("journal", niche="yoga", brand_name="Kind Mornings", description="")
    assert "I'm Kind" not in json.dumps(pages)


def test_cap_home_lists_touches_only_courses_and_events_on_home():
    entries = [{"family": f} for f in ("hero", "courseShowcase", "events", "faq")]
    fields = [{} for _ in entries]
    sc._finish_copy("home", entries, fields, sc._ctx("yoga", "Maya Laurent", ""))
    assert [f.get("limit") for f in fields] == [None, "3", "3", None]
    fields = [{} for _ in entries]
    sc._finish_copy("courses", entries, fields, sc._ctx("yoga", "Maya Laurent", ""))
    assert not any("limit" in f for f in fields)


@pytest.mark.django_db
def test_story_signature_is_the_owners_first_name(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    monkeypatch.setattr(sc, "_coach_first_name", lambda tenant: "")
    assert all("signature" not in b for b in sc.compose_page(styled, "about"))
    monkeypatch.setattr(sc, "_coach_first_name", lambda tenant: "Maya")
    stories = [b for b in sc.compose_page(styled, "about") if b["type"] == "section.story"]
    assert stories and all(b["signature"] == "Maya" for b in stories)


@pytest.mark.django_db
def test_coach_first_name_reads_the_owner_not_the_brand(styled, tenant_ctx):
    """ "Kind Mornings" is a brand that looks like a name: the letter is signed by whoever owns the site.
    tenant_ctx empties the shared tenant's users first: other tests (xdist) leave owners behind."""
    from apps.accounts.models import User

    assert sc._coach_first_name(styled) == ""  # no owner yet
    with tenant_context(styled):
        User.objects.create_user(email="ayse@example.com", name="Ayse  Demir Yilmaz", role="owner", is_staff=True)
        User.objects.create_user(email="student@example.com", name="Zed Student", role="student")
    assert sc._coach_first_name(styled) == "Ayse"
    pages = sc.skeleton_pages("journal", niche="yoga", brand_name="Kind Mornings", description="")
    assert all("signature" not in b for p in pages.values() for b in p["blocks"])  # no owner at provisioning


def test_fallback_headlines_fit_the_home_cap():
    assert all(len(h) <= sc.HOME_HERO_HEADLINE_MAX for h in sc._HEADLINES.values())
    assert not any(sc._banned(h) for h in sc._HEADLINES.values())
    ctx = sc._ctx("unlisted_niche", "Maya Laurent", "", "strength and conditioning for trail runners")
    assert len(sc.fallback_fields("hero", "home", "journal.editorial", ctx)["headline"]) <= sc.HOME_HERO_HEADLINE_MAX


def test_fallback_home_hero_has_one_button_and_home_lists_fit():
    ctx = sc._ctx("yoga", "Maya Laurent", "")
    hero = sc.fallback_fields("hero", "home", "journal.editorial", ctx)
    assert not {"meta", "secondaryLabel", "secondaryHref"} & set(hero)
    for family, (field, cap) in sc.HOME_LIST_MAX.items():
        assert len(sc.fallback_fields(family, "home", "journal.band", ctx)[field]) <= cap


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
    monkeypatch.setattr(
        sc.curated_cache, "cache_remote_image", lambda image, **kwargs: SimpleNamespace(pk=image.asset_id)
    )
    ctx = sc._ctx("general", "Iron Fist", "Boxing for beginners", "boxing")
    image, _ = sc._find_photo(["boxing coach"], "16:9", set(), ctx)
    assert image.asset_id == "box"  # names the subject: first
    image, _ = sc._find_photo(["boxing coach"], "16:9", {"box"}, ctx)
    assert image.asset_id == "gym"  # neutral is fine; the pole photo never is
    image, _ = sc._find_photo(["boxing coach"], "16:9", {"box", "gym"}, ctx)
    assert image.asset_id in {"box", "gym"}


def test_a_peers_photo_loses_to_a_fresh_one_from_the_brief_queries(monkeypatch):
    best = _remote("best", "woman boxing in a gym")
    other = _remote("other", "boxer wrapping hands, boxing gym")
    fresh = _remote("fresh", "woman boxing in a gym")

    def search(query, **_kw):  # the topic pool holds two photos a peer shows; the slot's own query finds a third
        return curated_client.SearchPage(
            results=[best, other] if query == "boxing" else [fresh], page=1, has_next=False
        )

    monkeypatch.setattr(sc.curated_client, "search", search)
    monkeypatch.setattr(
        sc.curated_cache, "cache_remote_image", lambda image, **kwargs: SimpleNamespace(pk=image.asset_id)
    )
    ctx = sc._ctx("general", "Iron Fist", "Boxing for beginners", "boxing")
    peers = frozenset({"best", "other"})

    def pick(taken, avoid=frozenset()):
        return sc._find_photo(["boxing woman"], "16:9", taken, ctx, avoid=avoid)[0].asset_id

    assert pick(set()) == "best"
    assert pick(set(), peers) == "fresh"  # pass 1: neither pool photo, but the query's
    # Nothing else fits ("fresh" and "best" are on the page already): the peer's photo that is still free,
    # not "best" again, which the repeat-a-pool-photo fallback would hand out first
    assert pick({"best", "fresh"}, peers) == "other"


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


def test_links_follow_what_the_coach_offers():
    """Audit R5: a live-only coach's site had "Explore our courses" leading nowhere."""
    live = sc.coach_links({"offers": ["live", "community"]})
    assert "/courses" not in live and {"/events", "/calendar", "/about"} <= set(live)
    assert not {"/courses", "/events", "/calendar"} & set(sc.coach_links({"offers": ["articles"]}))
    assert sc.coach_links({}) == sc.ALLOWED_LINKS  # an older brief keeps every link
    # A link the coach has no page for falls to her main offer.
    assert sc._safe_href("/courses", "home", "/courses", links=live, primary="/events") == "/events"
    assert sc._safe_href("/about", "home", "/courses", links=live, primary="/events") == "/about"


def test_fallback_buttons_lead_to_the_coachs_main_offer():
    live = sc._ctx("yoga", "Maya Laurent", "Slow vinyasa.", links=sc.coach_links({"offers": ["live"]}))
    hero = sc.fallback_fields("hero", "home", "journal.editorial", live)
    assert hero["ctaHref"] == "/events" and "course" not in hero["ctaLabel"].lower()
    cta = sc.fallback_fields("cta", "home", "journal.band", live)
    assert cta["ctaHref"] == "/events" and "course" not in (cta["text"] + cta["ctaLabel"]).lower()
    courses = sc._ctx("yoga", "Maya Laurent", "Slow vinyasa.")
    assert sc.fallback_fields("hero", "home", "journal.editorial", courses)["ctaHref"] == "/courses"


def _placed(asset_id, placement, text="boxing gym"):
    return curated_client.RemoteImage(
        asset_id=asset_id,
        title=text,
        description=text,
        tags=[],
        width=800,
        height=450,
        preview_url="",
        web_url="",
        subject_placement=placement,
    )


def test_wanted_placement_covers_every_style_and_names_each_overlay_hero():
    assert set(sc._HERO_PLACEMENT) == set(sections.styles())
    assert sc.wanted_placement("studiofloor", "hero", "image") == "left_third"  # text card on the right
    assert sc.wanted_placement("trail", "hero", "image") == "right_third"  # text card bottom-left
    for style in ("kinetic", "maison", "pop", "workshop"):  # text along the bottom / over the middle
        assert sc.wanted_placement(style, "hero", "image") == curated_client.NOT_CENTERED
    assert sc.wanted_placement("kinetic", "cta", "image") == "right_third"
    assert sc.wanted_placement("journal", "hero", "image") is None  # framed beside the text
    assert sc.wanted_placement("studiofloor", "hero", "image2") is None
    assert sc.wanted_placement("nope", "hero", "image") is None


def test_an_overlay_slot_never_gets_a_centered_photo_when_a_fitting_one_exists(monkeypatch):
    calls = []

    def search(query, **kwargs):
        calls.append(kwargs.get("subject_placement"))
        pool = [_placed("mid", "centered"), _placed("left", "left_third"), _placed("right", "right_third")]
        want = kwargs.get("subject_placement")
        return curated_client.SearchPage(
            results=[i for i in pool if not want or i.subject_placement == want], page=1, has_next=False
        )

    monkeypatch.setattr(sc.curated_client, "search", search)
    monkeypatch.setattr(
        sc.curated_cache, "cache_remote_image", lambda image, **kwargs: SimpleNamespace(pk=image.asset_id)
    )
    ctx = sc._ctx("general", "Iron Fist", "Boxing for beginners", "boxing")
    image, _ = sc._find_photo(["boxing"], "16:9", set(), ctx, wanted="left_third")
    assert image.asset_id == "left" and calls == ["left_third"]  # filtered server-side, pool never unfiltered
    # Bottom text: no filter to send, so the veto does the work.
    image, _ = sc._find_photo(["boxing"], "16:9", set(), ctx, wanted=curated_client.NOT_CENTERED)
    assert image.asset_id in {"left", "right"}


def test_an_overlay_slot_falls_back_to_the_unfiltered_search_and_prefers_unknown_over_wrong(monkeypatch):
    calls = []

    def search(query, **kwargs):
        calls.append(kwargs.get("subject_placement"))
        if kwargs.get("subject_placement"):
            return curated_client.SearchPage(results=[], page=1, has_next=False)
        results = [_placed("mid", "centered"), _placed("wrong", "right_third"), _placed("unknown", None)]
        return curated_client.SearchPage(results=results, page=1, has_next=False)

    monkeypatch.setattr(sc.curated_client, "search", search)
    monkeypatch.setattr(
        sc.curated_cache, "cache_remote_image", lambda image, **kwargs: SimpleNamespace(pk=image.asset_id)
    )
    ctx = sc._ctx("general", "Iron Fist", "Boxing for beginners", "boxing")
    image, _ = sc._find_photo(["boxing"], "16:9", set(), ctx, wanted="left_third")
    assert image.asset_id == "unknown"
    assert calls[0] == "left_third" and None in calls  # the filtered rung ran, then the unfiltered one
    # The only fitting photo is already placed: repeating it beats a fresh one under the text.
    image, _ = sc._find_photo(["boxing"], "16:9", {"unknown"}, ctx, wanted="left_third")
    assert image.asset_id == "unknown"
    # Nothing but known-wrong photos exists: still a photo, never a refusal.
    monkeypatch.setattr(
        sc.curated_client,
        "search",
        lambda query, **k: curated_client.SearchPage(results=[_placed("mid", "centered")], page=1, has_next=False),
    )
    image, _ = sc._find_photo(["boxing"], "16:9", set(), ctx, wanted="left_third", pools={})
    assert image.asset_id == "mid"


# ── given-only families: proof, statement, video (R10, S3) ──────────────────

GIVEN_ALL = frozenset(sc.GIVEN_FAMILIES)


def _runs_ok(families):
    run = 0
    for family in families:
        run = run + 1 if sc._image_heavy(family) else 0
        if run > sc.MAX_CONSECUTIVE_IMAGE_HEAVY:
            return False
    return True


def test_ai_never_writes_proof_or_clip_words():
    assert set(sc._writable("proof")) == {"heading"}
    assert sc._writable("video") == {}


@pytest.mark.parametrize("style_id", ENABLED)
def test_nothing_given_composes_as_before(style_id):
    pages = sc.apply_guardrails({}, style_id)["pages"]
    assert pages == sc.apply_guardrails({}, style_id, frozenset())["pages"]
    assert not {e["family"] for entries in pages.values() for e in entries} & GIVEN_ALL


def test_given_only_families_are_dropped_without_input():
    plan = {"pages": {"home": [{"family": f} for f in ("hero", "video", "story", "statement", "proof", "cta")]}}
    home = sc.apply_guardrails(plan, "journal")["pages"]["home"]
    assert not set(_families(home)) & GIVEN_ALL


@pytest.mark.parametrize("style_id", ENABLED)
def test_home_places_what_she_gave(style_id):
    home = _families(sc.apply_guardrails({}, style_id, GIVEN_ALL)["pages"]["home"])
    assert home[0] == "hero" and home[1] == "video"
    assert {"statement", "proof"} <= set(home) and "philosophy" not in home
    assert home[-1] in sc.CLOSING_FAMILIES
    assert len(home) <= sc.MAX_SECTIONS and _runs_ok(home)


def test_statement_takes_philosophys_place_and_proof_closes():
    plan = {"pages": {"home": [{"family": f} for f in ("hero", "story", "philosophy", "benefits", "cta")]}}
    home = sc.apply_guardrails(plan, "journal", frozenset({"statement", "proof"}))["pages"]["home"]
    assert _families(home) == ["hero", "story", "statement", "benefits", "proof", "cta"]


def test_her_statement_beats_a_planned_philosophy():
    plan = {"pages": {"home": [{"family": f} for f in ("hero", "philosophy", "story", "statement", "cta")]}}
    home = sc.apply_guardrails(plan, "journal", frozenset({"statement"}))["pages"]["home"]
    assert _families(home) == ["hero", "story", "statement", "cta"]


def test_a_belief_counts_only_when_it_makes_a_line():
    long_one = "I believe every body can learn to rest deeply, whatever it has been through so far"
    assert sc.statement_line(long_one) == ""
    assert "statement" not in sc.given_families({"belief": long_one})
    assert sc.statement_line("Rest is training. " + long_one) == "Rest is training."
    assert "statement" in sc.given_families({"belief": "Rest is training."})


def test_philosophy_and_statement_never_share_a_page():
    plan = {"pages": {"about": [{"family": f} for f in ("hero", "philosophy", "statement", "cta")]}}
    about = sc.apply_guardrails(plan, "journal", frozenset({"statement"}))["pages"]["about"]
    assert _families(about) == ["hero", "philosophy", "cta"]


def test_the_planner_sees_only_what_she_gave():
    coach = {"brand": "Maya Laurent", "niche": "yoga"}
    assert '"proof"' not in sc._plan_user_turn(coach, "journal")
    turn = sc._plan_user_turn(coach, "journal", frozenset({"proof"}))
    assert '"proof"' in turn and '"video"' not in turn


def _give(tenant, **answers):
    tenant.refresh_from_db()
    tenant.wizard_state["answers"].update(answers)
    tenant.save(update_fields=["wizard_state"])


@pytest.mark.django_db
def test_only_consented_quotes_are_placed(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    _give(
        styled,
        proof={
            "quotes": [
                {"quote": "Mornings got  easier.", "name": "Ana", "consent": True},
                {"quote": "She never asked me.", "name": "Bo", "consent": False},
                {"quote": "", "name": "Cy", "consent": True},
            ],
            "numbers": [{"value": "300", "label": ""}, {"value": "More than 300", "label": "students"}],
            "press": ["Yoga Journal", " ", "N" * 41],
        },
    )
    given = sc.coach_given(styled)
    assert given["proof"] == {
        "quotes": [{"quote": "Mornings got easier.", "name": "Ana"}],
        "numbers": [],
        "press": [{"name": "Yoga Journal"}],
    }
    proof = next(b for b in sc.compose_page(styled, "home") if b["type"] == "section.proof")
    assert proof["quotes"] == [{"quote": "Mornings got easier.", "name": "Ana"}]
    assert proof["press"] == [{"name": "Yoga Journal"}]
    assert proof["heading"] == "In their words"


@pytest.mark.django_db
def test_the_page_model_writes_proofs_heading_only_and_hears_her_belief(styled, monkeypatch, catalog):
    fake = FakeAI(plan=core_ai.AiError("no plan"))
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    _give(
        styled,
        belief="Rest is part of training.",
        proof={"quotes": [{"quote": "Mornings got easier.", "name": "Ana", "consent": True}]},
    )
    blocks = sc.compose_page(styled, "home")
    page_turn = next(user for label, user in fake.calls if "Page spec" in user)
    assert "Rest is part of training." in page_turn
    proof = next(b for b in blocks if b["type"] == "section.proof")
    assert proof["heading"] == "proof heading"  # the model's
    assert proof["quotes"] == [{"quote": "Mornings got easier.", "name": "Ana"}]  # hers, untouched


@pytest.mark.django_db
def test_a_deleted_clip_is_not_placed(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    _give(styled, clip={"video_id": 987654})
    assert sc.coach_given(styled)["clip"] is None
    assert not any(b["type"] == "section.video" for b in sc.compose_page(styled, "home"))


@pytest.mark.django_db
def test_her_clip_follows_the_home_hero(styled, monkeypatch, catalog):
    from apps.courses.models import Video

    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    with tenant_context(styled):
        video = Video.objects.create(title="Clip", s3_key="library/clip.mp4")
    _give(styled, clip={"video_id": video.pk})
    blocks = sc.compose_page(styled, "home")
    assert blocks[1]["type"] == "section.video"
    assert blocks[1]["video"] == {"url": None, "video_id": video.pk}
    assert blocks[1]["shape"] == "vertical" and not blocks[1].get("heading")


@pytest.mark.django_db
def test_cached_plan_gets_her_given_families_at_compose(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    plan = sc.plan_site(styled)
    assert "proof" not in _families(plan["pages"]["home"])
    _give(styled, proof={"numbers": [{"value": "300", "label": "students taught"}]})
    proof = next(b for b in sc.compose_page(styled, "home") if b["type"] == "section.proof")
    assert proof["numbers"] == [{"value": "300", "label": "students taught"}]
    assert proof["heading"] == ""  # no quotes: no "In their words"


@pytest.mark.django_db
def test_statement_fallback_is_her_belief(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    _give(styled, belief="Rest is part of training.")
    blocks = sc.compose_page(styled, "home")
    assert next(b for b in blocks if b["type"] == "section.statement")["statement"] == "Rest is part of training."
    assert not any(b["type"] == "section.philosophy" for b in blocks)
    _give(
        styled,
        belief="Rest is part of training. Most teachers push through pain; bodies that sit all day need the opposite.",
    )
    blocks = sc.compose_page(styled, "home")
    assert next(b for b in blocks if b["type"] == "section.statement")["statement"] == "Rest is part of training."


@pytest.mark.django_db
def test_her_words_are_never_cut_or_split(styled):
    _give(styled, proof={"quotes": [{"quote": "word " * 70, "name": "Ana", "consent": True}], "press": "Vogue"})
    given = sc.coach_given(styled)
    assert given["proof"] == {"quotes": [], "numbers": [], "press": []}  # too long for the section: left out
    assert sc.given_families(given) == frozenset()


# ── several disciplines: equal or one main focus ────────────────────────────


def _said(tenant, teaches, focus=None):
    """The tenant's answers as the interview stores them: what she offers and her answer to the focus question."""
    from apps.tenant_config import interview_brief

    answers = {"style": "journal"}
    interview_brief.apply_fact(answers, "teaches", teaches)
    if focus:
        assert interview_brief.apply_fact(answers, "discipline_focus", focus)
    tenant.wizard_state = {"flow": "interview", "answers": answers}
    tenant.save(update_fields=["wizard_state"])


_FIND_PHOTO = sc._find_photo


def _compose_home(tenant, monkeypatch, teaches, focus=None):
    """(the home hero, [(topic, first query) of each photo searched for, in page order]), copy and photos as the
    composer writes them without the AI."""
    _said(tenant, teaches, focus)
    monkeypatch.setattr(sc.ai_compose, "compose_available", lambda: False)
    shown = []

    def spy(queries, aspect, used, ctx, *args, **kwargs):
        shown.append((ctx["topic"], queries[0]))
        return _FIND_PHOTO(queries, aspect, used, ctx, *args, **kwargs)

    monkeypatch.setattr(sc, "_find_photo", spy)
    return sc.compose_page(tenant, "home")[0], shown


@pytest.mark.django_db
def test_equal_and_a_main_focus_compose_noticeably_different_sites(styled, monkeypatch, catalog):
    single, single_shown = _compose_home(styled, monkeypatch, "Yoga")
    equal, equal_shown = _compose_home(styled, monkeypatch, "Yoga, Nutrition", "They're equal")
    yoga, yoga_shown = _compose_home(styled, monkeypatch, "Yoga, Nutrition", "Mostly yoga")
    food, food_shown = _compose_home(styled, monkeypatch, "Yoga, Nutrition", "Mostly nutrition")

    # One discipline: as ever (no focus asked, one topic, the niche's own headline).
    assert single["headline"] == "Steadier breath, quieter mind"
    assert {topic for topic, _ in single_shown} == {"yoga"}

    # Equal: the hero names both, and the photos take turns, the hero's first two included.
    assert equal["headline"] == "Yoga and nutrition, together"
    assert equal["kicker"] == "Yoga and nutrition with Maya Laurent"
    assert "I teach yoga and nutrition" in equal["subhead"]
    assert [t for t, _ in equal_shown[:4]] == ["yoga", "nutrition", "yoga", "nutrition"]
    assert abs(sum(t == "yoga" for t, _ in equal_shown) - sum(t == "nutrition" for t, _ in equal_shown)) <= 1

    # A main focus leads: its headline, its hero photo and most of the page; the other one supports.
    assert yoga["headline"] == "Steadier breath, quieter mind" and yoga["kicker"] == "Yoga with Maya Laurent"
    assert yoga["subhead"].endswith("I also teach nutrition.")
    assert yoga_shown[0][1].startswith("yoga ") and food_shown[0][1].startswith("nutrition ")
    assert food["headline"] == "Real food, every night of the week" and food["subhead"].endswith("I also teach yoga.")
    for shown, lead, other in ((yoga_shown, "yoga", "nutrition"), (food_shown, "nutrition", "yoga")):
        topics = [t for t, _ in shown]
        assert topics.count(lead) > len(topics) / 2 and other in topics[1:]
        assert topics[0] == lead and topics[1] == lead  # the hero's photos are the main one's

    # The same two disciplines, four different sites.
    assert len({(h["headline"], h["subhead"]) for h in (single, equal, yoga, food)}) == 4
    assert equal_shown != yoga_shown != food_shown


@pytest.mark.django_db
def test_the_models_see_the_focus_only_when_she_gave_one(styled, monkeypatch):
    _said(styled, "Yoga")
    assert "focus" not in sc._coach_data(styled, "Maya Laurent")
    _said(styled, "Yoga, Nutrition")
    assert "focus" not in sc._coach_data(styled, "Maya Laurent")  # asked, not yet answered: as before
    _said(styled, "Yoga, Nutrition", "They're equal")
    equal = sc._coach_data(styled, "Maya Laurent")
    assert equal["focus"] == {"mode": "equal", "disciplines": ["yoga", "nutrition"]}
    assert equal["topic"] == "yoga and nutrition"
    _said(styled, "Yoga, Nutrition", "Mostly nutrition")
    main = sc._coach_data(styled, "Maya Laurent")
    assert main["focus"] == {
        "mode": "primary",
        "primary": "nutrition",
        "secondary": ["yoga"],
        "disciplines": ["nutrition", "yoga"],
    }
    assert main["topic"] == "nutrition" and main["niche"] == "cooking"

    fake = FakeAI(plan={})
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    sc.plan_site(styled, force=True)
    sc.compose_page(styled, "home")

    def coach_data(label):
        lines = next(user for name, user in fake.calls if name == label).splitlines()
        return json.loads(lines[next(n for n, line in enumerate(lines) if line.startswith("<<COACH_DATA")) + 1])

    for label in ("contentor:compose-plan", "contentor:compose-page"):
        assert coach_data(label)["focus"] == main["focus"]
    assert 'Focus\n- When the coach data has a "focus"' in sc.PAGE_SYSTEM_PROMPT


def test_a_photos_discipline_follows_the_focus():
    def topics(focus, page, families):
        ctx = sc._ctx("yoga", "Maya", "", "yoga and nutrition", focus=focus)
        rest = 0
        out = []
        for n, family in enumerate(families):
            out.append(sc._slot_topic(ctx, page, family, n, rest))
            rest += family != "hero"
        return out

    flow = ["hero", "hero", "story", "benefits", "moments", "cta"]
    equal = {"mode": "equal", "disciplines": ["yoga", "nutrition"]}
    assert topics(equal, "home", flow) == ["yoga", "nutrition", "yoga", "nutrition", "yoga", "nutrition"]
    assert topics(equal, "about", flow)[0] == "nutrition"  # an inner page does not always open on the same one
    main = {"mode": "primary", "primary": "yoga", "secondary": ["nutrition"], "disciplines": ["yoga", "nutrition"]}
    assert topics(main, "home", flow) == ["yoga", "yoga", "yoga", "yoga", "nutrition", "yoga"]
    assert topics(main, "faq", ["hero"]) == ["yoga"]
    assert sc._slot_topic(sc._ctx("yoga", "Maya", "", "yoga"), "home", "hero", 0, 0) == "yoga"  # one discipline


def test_the_photos_of_every_discipline_are_allowed_and_the_generic_briefs_leave_the_name_to_each_photo():
    ctx = sc._ctx("fitness", "Iron", "", "boxing", focus={"mode": "primary", "disciplines": ["boxing", "yoga"]})
    assert {"boxing", "yoga"} <= ctx["allowed"]  # the supporting discipline's photos are never "off topic"
    assert sc._generic_brief("hero", "image", ctx, "home")["subject"] == "instructor teaching a class"
    assert "boxing" not in sc._queries(sc._generic_brief("hero", "image", ctx, "home"), {**ctx, "topic": "yoga"}, "")[0]


def test_the_photo_brief_fields_are_asked_for_in_english():
    # The plan call runs in the site's language; these fields go to Pix4Less as they are written.
    assert "Write subject, action, setting and person in English whatever language the site is in" in (
        sc.PLAN_SYSTEM_PROMPT
    )
