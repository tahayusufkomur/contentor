"""Unit tests for the AI-touch foundation: brief assembly + prefilter."""

from types import SimpleNamespace

import pytest

from apps.core.onboarding import ai_curate


def _row(pk, title, tags, position=0):
    return SimpleNamespace(pk=pk, title=title, tags=tags, position=position)


def _tenant(answers, name="Glow Studio"):
    return SimpleNamespace(wizard_state={"answers": answers}, name=name)


def test_brief_from_tenant_reads_wizard_answers():
    tenant = _tenant(
        {
            "niche": "yoga",
            "description": "Vinyasa for busy professionals",
            "description_followups": {"items": [{"q": "Who?", "a": "Office workers"}, {"q": "", "a": "dropped"}]},
            "goals": ["sell_courses"],
            "theme": "forest",
            "font_family": "Lora",
        }
    )
    brief = ai_curate.CoachBrief.from_tenant(tenant, locale="tr")
    assert brief.niche == "yoga"
    assert brief.description == "Vinyasa for busy professionals"
    assert brief.followups == (("Who?", "Office workers"),)
    assert brief.goals == ("sell_courses",)
    assert brief.theme == "forest"
    assert brief.brand_name == "Glow Studio"
    assert brief.locale == "tr"


def test_brief_from_tenant_defaults_on_empty_state():
    brief = ai_curate.CoachBrief.from_tenant(SimpleNamespace(wizard_state=None, name="X"), locale="en")
    assert brief.niche == "general"
    assert brief.description == ""
    assert brief.followups == ()


def test_brief_block_contains_coach_words_and_language():
    brief = ai_curate.CoachBrief(
        niche="yoga", description="Calm vinyasa", followups=(("Who?", "Beginners"),), locale="tr", brand_name="Glow"
    )
    block = ai_curate.brief_block(brief)
    assert "<coach_brief>" in block and "</coach_brief>" in block
    assert "Calm vinyasa" in block
    assert 'Asked: "Who?"' in block
    assert "Turkish" in block


def test_shortlist_orders_by_token_overlap_then_position():
    brief = ai_curate.CoachBrief(niche="yoga", description="meditation and breathing for stress")
    rows = [
        _row(1, "Gym Barbell", "gym, barbell, strength", position=0),
        _row(2, "Lotus Calm", "yoga, meditation, lotus", position=5),
        _row(3, "Breathing Space", "breathing, stress, calm", position=1),
        _row(4, "Sunset", "sunset, beach", position=2),
    ]
    picked = ai_curate.shortlist(rows, brief, limit=3)
    # Both 2-token hits (2=yoga+meditation, 3=breathing+stress); position breaks
    # the tie, so row 3 (position=1) precedes row 2 (position=5).
    assert [r.pk for r in picked[:2]] == [3, 2]
    assert picked[2].pk in (1, 4)  # zero-score tail filled by position


def test_shortlist_empty_brief_returns_position_order():
    brief = ai_curate.CoachBrief()
    rows = [_row(1, "B", "b", position=2), _row(2, "A", "a", position=1)]
    assert [r.pk for r in ai_curate.shortlist(rows, brief, limit=2)] == [2, 1]


def _seed_logos():
    from apps.core.models import CuratedLogo

    rows = [
        CuratedLogo.objects.create(
            title="Lotus Mark", tags="yoga, lotus, calm", image_key="platform/curated-logos/a.png", position=1
        ),
        CuratedLogo.objects.create(
            title="Barbell Mark", tags="gym, barbell", image_key="platform/curated-logos/b.png", position=2
        ),
    ]
    return rows


@pytest.mark.django_db
def test_rank_logos_returns_validated_ordered_ids(monkeypatch):
    rows = _seed_logos()

    def fake(**kwargs):
        parsed = kwargs["output_model"].model_validate(
            {"logo_ids": [rows[1].pk, 999999, rows[0].pk, rows[1].pk]}  # hallucination + dupe
        )
        return parsed, 0.005, "claude-haiku-4-5"

    monkeypatch.setattr(ai_curate.core_ai, "structured", fake)
    ids = ai_curate.rank_logos(ai_curate.CoachBrief(niche="yoga"), tenant_schema="glow")
    assert ids == [rows[1].pk, rows[0].pk]


@pytest.mark.django_db
def test_rank_logos_empty_catalog_no_call(monkeypatch):
    def boom(**kwargs):
        raise AssertionError("no call expected")

    monkeypatch.setattr(ai_curate.core_ai, "structured", boom)
    assert ai_curate.rank_logos(ai_curate.CoachBrief(), tenant_schema="glow") == []
