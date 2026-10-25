"""The setup interview's photos question: asked early, answered by uploading
(or leaving the photos to the guide), and what it changes: the home page waits
for it, and her photos come before any catalog photo."""

from dataclasses import replace

import pytest
from django.db import connection

from apps.core.curated_images import cache as curated_cache
from apps.core.models import Tenant
from apps.core.onboarding import site_composer as sc
from apps.media import own_photos
from apps.media.models import Photo
from apps.tenant_config import interview
from apps.tenant_config import interview_brief as brief
from apps.tenant_config import interview_milestones as milestones

pytestmark = pytest.mark.django_db


@pytest.fixture()
def tenant(tenant_ctx):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": {}})
    tenant_ctx.refresh_from_db()
    return tenant_ctx


def photo(title, width=3000, height=2000, status=own_photos.PENDING, **fields):
    return Photo.objects.create(
        s3_key=f"tenants/shared-test/photo/{title.replace(' ', '-')}.jpg",
        title=title,
        width=width,
        height=height,
        index_status=status,
        **fields,
    )


def said(tenant, **answers):
    Tenant.objects.filter(pk=tenant.pk).update(wizard_state={"flow": "interview", "answers": answers})


# ── the question ─────────────────────────────────────────────────────────────


def test_it_is_asked_right_after_what_she_teaches():
    ids = [f.id for f in brief.FIELDS]
    assert ids.index("photos") == ids.index("specialty") + 1
    answers = {"teaches": "Chess"}  # no broad tile: no specialty question
    assert interview._next_field(brief.missing(answers), None, answers).id == "photos"


def test_it_is_a_screen_of_its_own_that_the_model_never_fills():
    field = brief.FIELD_BY_ID["photos"]
    assert field.kind in brief.CARD_KINDS
    assert "photos" not in interview.SYSTEM.split("Brief fields")[1]
    assert brief.coerce("photos", "yes I have photos") is None
    guide = interview.guide_for(field, answers={})
    assert guide["photos"] is True and guide["options"] == [] and guide["can_delegate"] is False
    assert interview.guide_for(brief.FIELD_BY_ID["audience"], answers={})["photos"] is False
    assert interview.guide_for(None)["photos"] is False


def test_the_guide_counts_the_shapes_a_home_page_shows():
    guide = milestones.photo_guide()
    by_shape = {g["shape"]: g for g in guide}
    assert set(by_shape) == {"portrait", "landscape", "square"}
    # Upright is what most sections crop to; the most used shape comes first.
    assert guide[0]["shape"] == "portrait"
    assert [g["count"] for g in guide] == sorted((g["count"] for g in guide), reverse=True)
    assert by_shape["landscape"]["count"] >= 2 and by_shape["portrait"]["count"] >= 6
    assert all(g["label"] and g["aspect"] and g["use"] and g["shoot"] for g in guide)


def test_the_card_shows_her_photos_and_nothing_else(tenant):
    mine = photo("warrior pose")
    Photo.objects.create(s3_key="tenants/shared-test/curated/abc.webp", title="catalog copy")
    Photo.objects.create(s3_key="tenants/shared-test/branding/logo.png", title="Logo")
    card = milestones.cards_for(tenant, {}, "photos")
    assert card["kind"] == "photos"
    assert card["guide"] == milestones.photo_guide()
    assert [p["id"] for p in card["photos"]] == [str(mine.pk)]
    assert card["photos"][0] | {"url": ""} == {
        "id": str(mine.pk),
        "url": "",
        "title": "warrior pose",
        "width": 3000,
        "height": 2000,
        "status": "pending",
    }
    assert card["photos"][0]["url"].startswith("http")


# ── the answer ───────────────────────────────────────────────────────────────


def test_her_own_photos_need_at_least_one_photo(tenant):
    answers = {}
    with pytest.raises(milestones.ChoiceError, match="no_photos"):
        milestones.choose(tenant, answers, "photos", "own")
    assert "photos" not in answers
    photo("warrior pose")
    milestones.choose(tenant, answers, "photos", "own")
    assert answers["photos"] == "own"
    assert brief.is_settled(answers, "photos")


@pytest.mark.parametrize("value", ["stock", brief.DELEGATE, "anything else"])
def test_any_other_answer_leaves_the_photos_to_the_guide(tenant, value):
    answers = {}
    milestones.choose(tenant, answers, "photos", value)
    assert answers["photos"] == "stock"
    assert "photos" not in (answers.get("delegated") or [])


def test_the_home_page_waits_for_the_answer(tenant):
    answers = {
        "teaches": "Chess",
        "audience": "Kids",
        "outcome": "Focus",
        "offers": ["course"],
        "teachers": "solo",
        "pitch": "Chess for kids",
    }
    assert "page:home" not in milestones._due(tenant, answers)
    assert "page:home" in milestones._due(tenant, {**answers, "photos": "stock"})


def test_a_site_built_before_the_question_existed_is_never_asked(tenant):
    said(tenant, teaches="Chess")
    tenant.refresh_from_db()
    assert "photos" not in brief.answers_of(tenant)
    Tenant.objects.filter(pk=tenant.pk).update(
        wizard_state={"flow": "interview", "answers": {"teaches": "Chess"}, "site_plan": {"pages": {}}}
    )
    tenant.refresh_from_db()
    assert brief.answers_of(tenant)["photos"] == "stock"
    assert "photos" not in [f.id for f in brief.missing(brief.answers_of(tenant))]


# ── what it changes ──────────────────────────────────────────────────────────


def test_her_photos_are_preferred_only_once_she_said_so(tenant):
    photo("warrior pose")
    assert own_photos.preferred() is False
    said(tenant, photos="stock")
    assert own_photos.preferred() is False
    said(tenant, photos="own")
    assert own_photos.preferred() is True
    Photo.objects.all().delete()
    assert own_photos.preferred() is False  # nothing of hers left: the catalog fills the site


def test_the_composer_places_her_photos_before_any_catalog_photo(tenant, monkeypatch):
    wide, tall = photo("wide class", 3000, 2000), photo("tall portrait", 2000, 3000)
    monkeypatch.setattr(sc.curated_client, "search", lambda *a, **k: pytest.fail("searched the catalog"))
    ctx = {"topic": "boxing", "allowed": frozenset()}

    image, placed = sc._find_photo(["boxing coach teaching"], "16:9", set(), ctx, own=True)
    assert (image.asset_id, placed) == (f"own:{wide.pk}", wide)
    # Named nothing like the slot, and never dropped as off topic: it is hers.
    image, placed = sc._find_photo(["boxing coach teaching"], "4:5", set(), ctx, own=True)
    assert placed == tall


def test_a_slot_her_photos_cannot_fill_goes_to_the_catalog(tenant, monkeypatch):
    wide = photo("wide class", 3000, 2000)
    stock = sc.curated_client.RemoteImage("box", "Boxing", "boxer wrapping hands, boxing gym", [], 1600, 900, "p", "w")
    page = sc.curated_client.SearchPage(results=[stock], page=1, has_next=False)
    monkeypatch.setattr(sc.curated_client, "search", lambda *a, **k: page)
    monkeypatch.setattr(sc.curated_cache, "cache_remote_image", lambda image: f"photo-of-{image.asset_id}")
    ctx = sc._ctx("general", "Iron Fist", "Boxing for beginners", "boxing")

    # Her one wide photo is already on the page: the next wide slot is the catalog's.
    image, placed = sc._find_photo(["boxing"], "16:9", {f"own:{wide.pk}"}, ctx, own=True)
    assert (image.asset_id, placed) == ("box", "photo-of-box")
    # Without her say-so the catalog is used even when her photo would fit.
    image, _ = sc._find_photo(["boxing"], "16:9", set(), ctx, pools={})
    assert image.asset_id == "box"


def test_a_photo_whose_subject_sits_under_the_text_goes_last(tenant, monkeypatch):
    under, beside = photo("centered"), photo("to the side")

    def search(query, aspect=None, exclude=(), limit=12):
        # Where the subject sits is what the service saw in each photo.
        seen = [
            replace(own_photos.as_image(under), subject_placement="centered"),
            replace(own_photos.as_image(beside), subject_placement="left_third"),
        ]
        return [i for i in seen if i.asset_id not in exclude]

    monkeypatch.setattr(own_photos, "search", search)
    ctx = {"topic": "x", "allowed": frozenset()}
    image, placed = sc._find_photo(["x"], "16:9", set(), ctx, wanted="left_third", own=True)
    assert placed == beside
    # With only the centered one left it is still used: her photo before a stranger's.
    image, placed = sc._find_photo(["x"], "16:9", {f"own:{beside.pk}"}, ctx, wanted="left_third", own=True)
    assert placed == under


def test_a_cached_own_image_is_the_photo_itself(tenant):
    mine = photo("warrior pose")
    assert curated_cache.cache_remote_image(own_photos.as_image(mine)) == mine
    mine_id = mine.pk
    mine.delete()
    gone = sc.curated_client.RemoteImage(f"own:{mine_id}", "", "", [], 1, 1, "", "")
    with pytest.raises(sc.curated_client.CuratedImageError):
        curated_cache.cache_remote_image(gone)


def test_a_drafted_course_gets_one_of_her_wide_photos_as_its_cover(tenant):
    from apps.accounts.models import User
    from apps.courses.models import Course

    coach = User.objects.create_user(email="c@photos.test", name="C", password="x", role="owner")  # noqa: S106
    said(tenant, photos="own")
    first, second = photo("class one"), photo("class two")
    photo("tall portrait", 2000, 3000)

    cover = curated_cache.auto_cover("yoga class")
    assert cover in (first, second)
    Course.objects.create(title="Morning flow", thumbnail=cover, instructor=coach)
    # The next cover is her other wide photo, never the same one twice.
    assert curated_cache.auto_cover("yoga class") == ({first, second} - {cover}).pop()


def test_a_photo_already_on_a_page_is_not_reused_as_a_cover(tenant):
    said(tenant, photos="own")
    on_page, free = photo("class one"), photo("class two")
    state = Tenant.objects.get(pk=tenant.pk).wizard_state
    state["site_plan"] = {"used_assets": {"home": [f"own:{on_page.pk}"]}}
    Tenant.objects.filter(pk=tenant.pk).update(wizard_state=state)
    assert curated_cache.auto_cover("yoga class") == free


def test_the_look_previews_show_her_wide_photos_first(tenant, monkeypatch):
    wide = photo("wide class", 3000, 2000)
    photo("tall portrait", 2000, 3000)
    monkeypatch.setattr(milestones, "_catalog_look_photos", lambda tenant, answers, subject: ["catalog-1", "catalog-2"])
    answers = {"teaches": "Boxing", "niche": "fitness"}
    assert milestones._look_photos(tenant, answers) == ["catalog-1", "catalog-2"]
    urls = milestones._look_photos(tenant, {**answers, "photos": "own"})
    assert len(urls) == 3 and urls[1:] == ["catalog-1", "catalog-2"]
    assert wide.s3_key.split("/")[-1] in urls[0]
    assert connection.tenant.schema_name


# ── alt text ─────────────────────────────────────────────────────────────────


def test_a_photo_of_hers_is_placed_without_a_guessed_alt_text(tenant, monkeypatch):
    from apps.tenant_config import sections

    said(tenant, photos="own")
    undescribed = photo("IMG 2231", 2000, 2500)
    family = "howItWorks"  # one upright photo slot
    block = {"type": f"section.{family}", "image": None}
    entry = {"family": family, "variant": "", "images": {"image": {"subject": "a woman teaching a yoga class"}}}
    monkeypatch.setattr(sc, "wanted_placement", lambda *a: None)
    ctx = {"topic": "yoga", "allowed": frozenset()}

    placed = sc._attach_images(tenant, "home", [block], [entry], ctx, "journal", {})

    assert placed == [f"own:{undescribed.pk}"]
    # Not the slot's brief: that describes a photo we imagined, not hers.
    assert block["image"] == {"url": None, "photo_id": str(undescribed.pk), "alt": ""}
    assert sections.families()[family]["fields"]["image"]["type"] == "image"


def test_a_page_reads_a_photos_description_once_it_has_one(tenant):
    from apps.tenant_config.serializers import _sign_assets

    described, plain = photo("IMG 1", alt_text="A woman in warrior pose on a mat."), photo("IMG 2")
    keys = {str(p.pk): p.s3_key for p in (described, plain)}
    alts = {str(described.pk): described.alt_text}
    page = {
        "blocks": [
            {"image": {"url": None, "photo_id": str(described.pk), "alt": ""}},
            {"image": {"url": None, "photo_id": str(described.pk), "alt": "Her own words"}},
            {"image": {"url": None, "photo_id": str(plain.pk), "alt": ""}},
            {"bgImage": {"url": None, "photo_id": str(described.pk)}},  # a block without alt text keeps its shape
        ]
    }
    _sign_assets(page, keys, {}, alts)
    first, kept, undescribed, bare = (next(iter(b.values())) for b in page["blocks"])
    assert first["alt"] == "A woman in warrior pose on a mat." and first["url"].startswith("http")
    assert kept["alt"] == "Her own words"
    assert undescribed["alt"] == ""
    assert "alt" not in bare
