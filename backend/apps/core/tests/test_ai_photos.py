"""Unit tests for curated-photo slot picking (LLM mocked)."""

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


def _seed_catalog():
    from apps.core.models import CuratedPhoto

    hero = CuratedPhoto.objects.create(
        title="Yoga Sunrise", tags="yoga, calm", kind="hero", image_key="platform/curated-photos/h1.jpg", position=1
    )
    stock = CuratedPhoto.objects.create(
        title="Mat Closeup", tags="yoga, mat", kind="stock", image_key="platform/curated-photos/s1.jpg", position=2
    )
    return hero, stock


def _fake_structured(picks):
    def fake(**kwargs):
        parsed = kwargs["output_model"].model_validate({"picks": picks})
        return parsed, 0.01, "claude-haiku-4-5"

    return fake


def test_pick_photos_validates_ids_and_groups(monkeypatch):
    hero, stock = _seed_catalog()
    slots = [
        ai_photos.Slot("hero", "Homepage hero", "hero"),
        ai_photos.Slot("course:1", 'Thumbnail for "Morning Flow"', "content"),
    ]
    monkeypatch.setattr(
        ai_photos.core_ai,
        "structured",
        _fake_structured(
            [
                {"slot": "hero", "photo_id": hero.pk},
                {"slot": "course:1", "photo_id": 999999},  # hallucinated -> dropped
                {"slot": "nonsense", "photo_id": stock.pk},  # unknown slot -> dropped
            ]
        ),
    )
    picks = ai_photos.pick_photos(CoachBrief(niche="yoga"), slots, tenant_schema="glow")
    assert set(picks) == {"hero"}
    assert picks["hero"].pk == hero.pk


def test_pick_photos_hero_slot_rejects_stock_kind(monkeypatch):
    hero, stock = _seed_catalog()
    slots = [ai_photos.Slot("hero", "Homepage hero", "hero")]
    monkeypatch.setattr(ai_photos.core_ai, "structured", _fake_structured([{"slot": "hero", "photo_id": stock.pk}]))
    picks = ai_photos.pick_photos(CoachBrief(niche="yoga"), slots, tenant_schema="glow")
    assert picks == {}


def test_pick_photos_no_slots_no_call(monkeypatch):
    def boom(**kwargs):
        raise AssertionError("must not call the provider with no slots")

    monkeypatch.setattr(ai_photos.core_ai, "structured", boom)
    assert ai_photos.pick_photos(CoachBrief(), [], tenant_schema="glow") == {}


def test_pick_photos_provider_error_raises_curate_error(monkeypatch):
    _seed_catalog()
    from apps.core import ai as core_ai

    def fail(**kwargs):
        raise core_ai.AiError("provider down")

    monkeypatch.setattr(ai_photos.core_ai, "structured", fail)
    with pytest.raises(ai_photos.CurateError):
        ai_photos.pick_photos(CoachBrief(niche="yoga"), [ai_photos.Slot("hero", "x", "hero")], tenant_schema="glow")
