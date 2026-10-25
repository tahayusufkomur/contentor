"""The Designer's helps in the photo studio (apps.media.design_ai): words for a cover, and four styles."""

from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core.focus import covers
from apps.courses.models import Course
from apps.media import design_ai, designs
from apps.media.design_recipe import LAYOUTS
from apps.media.models import Photo

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="ai-coach@x.com", name="Coach", password="x", role="owner")


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def design(coach):
    picture = Photo.objects.create(s3_key="demo/flow.jpg", title="flow")
    course = Course.objects.create(
        title="Morning Flow", description="Twenty minutes of yoga before work.", instructor=coach, thumbnail=picture
    )
    return designs.open_draft("course", str(course.pk), recipe={"photo": {"id": str(picture.pk)}})


@pytest.fixture()
def model(monkeypatch):
    """The model answers what a test sets; its spend is recorded at nothing."""
    monkeypatch.setattr(design_ai.ai_compose, "compose_available", lambda: True)
    monkeypatch.setattr(design_ai.ai_compose, "record_spend", lambda *_: None)
    ask = mock.Mock()
    monkeypatch.setattr(design_ai.core_ai, "structured", ask)
    return ask


def test_three_words_for_a_part_cut_to_what_the_cover_keeps(client, design, model):
    model.return_value = (
        design_ai.WordOptions(options=["“Wake up gently”", "Wake up gently", "x" * 200, "  ", "Yoga before work"]),
        Decimal("0.001"),
        "m",
    )
    res = client.post(f"/api/v1/designs/{design.pk}/words/", {"part": "label"}, format="json")
    assert res.status_code == 200
    # quotes stripped, a repeat and a blank dropped, the long one cut to the label's 40
    assert res.json() == {"options": ["Wake up gently", "x" * 40, "Yoga before work"]}
    turn = model.call_args.kwargs["user"]
    assert '"part": "label"' in turn and "Twenty minutes of yoga" in turn and '"kind": "course"' in turn
    assert model.call_args.kwargs["system"] == design_ai.WORDS_SYSTEM


def test_words_say_when_they_cannot_come(client, design, model, monkeypatch):
    url = f"/api/v1/designs/{design.pk}/words/"
    assert client.post(url, {"part": "badge"}, format="json").status_code == 400
    model.side_effect = core_ai.AiError("down")
    assert client.post(url, {"part": "title"}, format="json").status_code == 502
    monkeypatch.setattr(design_ai.ai_compose, "compose_available", lambda: False)
    assert client.post(url, {"part": "title"}, format="json").status_code == 503


def test_four_styles_from_the_plan_on_the_covers_own_photo(client, design, model):
    plan = covers.CoverPlan(
        photo_query="yoga",
        styles=[
            covers.CoverStyle(layout="band", panel="accent", title_font="body", upper=True, subtitle="Before work"),
            covers.CoverStyle(layout="title", panel="ink", title_font="display", upper=False, subtitle=""),
        ],
    )
    model.return_value = (plan, Decimal("0.002"), "m")
    styles = client.post(f"/api/v1/designs/{design.pk}/styles/", {"shown": ["panel"]}, format="json").json()["styles"]
    assert len(styles) == 4
    assert [s["layout"] for s in styles][:2] == ["band", "title"]
    assert len({s["layout"] for s in styles}) == 4
    photo = designs._recipe_photo(design.recipe)
    assert styles[0]["photo"]["id"] == photo and styles[1]["photo"]["id"] is None  # a title-only cover draws none
    assert styles[0]["words"]["subtitle"] == "Before work"
    assert styles[0]["styles"]["title"] == {"font": "body", "upper": True}
    assert '"earlier_layouts": ["panel"]' in model.call_args.kwargs["user"]


def test_four_fixed_styles_without_the_model_and_never_a_cutout(client, design, monkeypatch):
    monkeypatch.setattr(design_ai.ai_compose, "compose_available", lambda: False)
    first = client.post(f"/api/v1/designs/{design.pk}/styles/", {}, format="json").json()["styles"]
    more = client.post(
        f"/api/v1/designs/{design.pk}/styles/", {"shown": [s["layout"] for s in first]}, format="json"
    ).json()["styles"]
    assert [s["layout"] for s in first] == list(covers.FALLBACK[0])
    assert [s["layout"] for s in more] == list(covers.FALLBACK[1])
    assert "cutout" in LAYOUTS and "cutout" not in covers.DRAFTED
