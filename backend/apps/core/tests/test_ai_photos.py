"""Unit tests for curated-photo slot picking (LLM mocked).

Candidates come from the remote curated catalog, which the conftest keeps in
offline fixture mode."""

from types import SimpleNamespace

import pytest

from apps.core.onboarding import ai_photos
from apps.core.onboarding.ai_curate import CoachBrief

pytestmark = pytest.mark.django_db


class FakeCourse(SimpleNamespace):
    pass


def _course(pk, title):
    return FakeCourse(pk=pk, title=title)


def test_build_slots_hero_about_courses_events():
    courses = [_course(1, "Morning Flow"), _course(2, "Deep Stretch")]

    class LiveClass(SimpleNamespace):
        pass

    events = [LiveClass(pk=10, title="Sunrise Live"), LiveClass(pk=11, title="Sunrise Live")]
    slots = ai_photos.build_slots({"hero_style": "split"}, courses, events)
    names = [s.name for s in slots]
    assert names == ["hero", "about", "course:1", "course:2", "event:LiveClass:Sunrise Live"]
    assert slots[0].group == "hero"
    assert all(s.group == "content" for s in slots[1:])


def test_build_slots_minimal_hero_skipped():
    slots = ai_photos.build_slots({"hero_style": "minimal"}, [], [])
    assert [s.name for s in slots] == ["about"]


def test_event_groups_distinct_by_model_and_title():
    class LiveClass(SimpleNamespace):
        pass

    class ZoomClass(SimpleNamespace):
        pass

    a1, a2 = LiveClass(pk=1, title="Flow"), LiveClass(pk=2, title="Flow")
    b = ZoomClass(pk=3, title="Flow")
    groups = ai_photos.event_groups([a1, a2, b])
    assert [(m, t, [r.pk for r in rows]) for m, t, rows in groups] == [
        ("LiveClass", "Flow", [1, 2]),
        ("ZoomClass", "Flow", [3]),
    ]


def _pools(brief):
    """(hero candidates, content candidates) exactly as pick_photos numbers them
    for this brief, so a test can name the image behind candidate N."""
    from apps.core.curated_images import client as curated_client
    from apps.core.onboarding.ai_curate import brief_query

    query = brief_query(brief)
    return (
        curated_client.search_or_browse(
            query, orientation=curated_client.WIDE, per_page=ai_photos.CANDIDATES_PER_GROUP
        ).results,
        curated_client.search_or_browse(query, per_page=ai_photos.CANDIDATES_PER_GROUP).results,
    )


def _fake_structured(picks):
    def fake(**kwargs):
        parsed = kwargs["output_model"].model_validate({"picks": picks})
        return parsed, 0.01, "claude-haiku-4-5"

    return fake


def test_pick_photos_validates_candidates_and_slots(monkeypatch):
    brief = CoachBrief(niche="yoga")
    hero_pool, _content_pool = _pools(brief)
    slots = [
        ai_photos.Slot("hero", "Homepage hero", "hero"),
        ai_photos.Slot("course:1", 'Thumbnail for "Morning Flow"', "content"),
    ]
    monkeypatch.setattr(
        ai_photos.core_ai,
        "structured",
        _fake_structured(
            [
                {"slot": "hero", "candidate": 1},
                {"slot": "course:1", "candidate": 999},  # off the list -> dropped
                {"slot": "nonsense", "candidate": 1},  # unknown slot -> dropped
            ]
        ),
    )
    picks = ai_photos.pick_photos(brief, slots, tenant_schema="glow")
    assert set(picks) == {"hero"}
    assert picks["hero"].asset_id == hero_pool[0].asset_id


def test_pick_photos_numbers_candidates_per_group(monkeypatch):
    """Candidate numbers are per list. A number that exists in the content list
    but runs off the end of the (shorter) hero list must be dropped for a hero
    slot and honoured for a content slot — a hero background may not quietly come
    from the wider pool."""
    brief = CoachBrief(niche="yoga")
    hero_pool, content_pool = _pools(brief)
    beyond_heroes = len(hero_pool) + 1
    assert beyond_heroes <= len(content_pool)  # otherwise this proves nothing
    slots = [
        ai_photos.Slot("hero", "Homepage hero", "hero"),
        ai_photos.Slot("about", "About image", "content"),
    ]
    monkeypatch.setattr(
        ai_photos.core_ai,
        "structured",
        _fake_structured([{"slot": "hero", "candidate": beyond_heroes}, {"slot": "about", "candidate": beyond_heroes}]),
    )
    picks = ai_photos.pick_photos(brief, slots, tenant_schema="glow")
    assert "hero" not in picks
    assert picks["about"].asset_id == content_pool[beyond_heroes - 1].asset_id


def test_pick_photos_catalog_outage_raises_curate_error(monkeypatch):
    from apps.core.curated_images import client as curated_client

    def down(*args, **kwargs):
        raise curated_client.CuratedImageError("the photo library is unavailable right now")

    monkeypatch.setattr(curated_client, "search", down)
    with pytest.raises(ai_photos.CurateError):
        ai_photos.pick_photos(CoachBrief(niche="yoga"), [ai_photos.Slot("hero", "x", "hero")], tenant_schema="glow")


def test_photo_query_describes_the_picture_not_the_business():
    """The catalog scores how completely an image covers EVERY concept in the
    query and drops whatever falls under its confidence floor, so each extra
    word both slows the search and shrinks the result set. A coach's onboarding
    prose ("I will teach online - on site pole dance classes") is not visual: it
    took the real service ~15s to answer and matched nothing, where the niche
    plus the requested style answers in ~5s and matches. Keep it visual."""
    from apps.core.onboarding.ai_curate import photo_query

    brief = CoachBrief(
        niche="pole_dance",
        description="I will teach online - on site pole dance classes.",
        followups=(("What makes you different?", "Small friendly beginner groups, no experience needed"),),
    )
    query = photo_query(brief, "a bright airy studio with dramatic side light")
    assert "pole dance" in query
    assert "bright airy studio" in query
    assert "teach online" not in query and "beginner groups" not in query
    assert len(query.split()) <= 14


def test_photo_query_falls_back_to_the_niche_with_no_style_asked_for():
    from apps.core.onboarding.ai_curate import photo_query

    assert photo_query(CoachBrief(niche="pole_dance")) == "pole dance"


def test_pick_photos_still_has_candidates_for_a_niche_the_catalog_cannot_match(monkeypatch):
    """A pole-dance coach's own words filter the catalog to zero rows. The
    wizard must still place photos — an empty pool means it silently finishes
    with a photo-less site."""
    from apps.core.curated_images import client as curated_client
    from apps.core.onboarding.ai_curate import brief_query

    brief = CoachBrief(niche="pole_dance", description="aerial hoop choreography")
    assert not curated_client.search(brief_query(brief), orientation=curated_client.WIDE).results
    monkeypatch.setattr(ai_photos.core_ai, "structured", _fake_structured([{"slot": "hero", "candidate": 1}]))
    picks = ai_photos.pick_photos(brief, [ai_photos.Slot("hero", "Homepage hero", "hero")], tenant_schema="glow")
    assert picks["hero"].asset_id


def test_pick_photos_no_slots_no_call(monkeypatch):
    def boom(**kwargs):
        raise AssertionError("must not call the provider with no slots")

    monkeypatch.setattr(ai_photos.core_ai, "structured", boom)
    assert ai_photos.pick_photos(CoachBrief(), [], tenant_schema="glow") == {}


def test_pick_photos_provider_error_raises_curate_error(monkeypatch):
    from apps.core import ai as core_ai

    def fail(**kwargs):
        raise core_ai.AiError("provider down")

    monkeypatch.setattr(ai_photos.core_ai, "structured", fail)
    with pytest.raises(ai_photos.CurateError):
        ai_photos.pick_photos(CoachBrief(niche="yoga"), [ai_photos.Slot("hero", "x", "hero")], tenant_schema="glow")
