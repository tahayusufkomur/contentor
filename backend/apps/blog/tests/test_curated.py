"""Curated-candidate selection + id resolution for the blog AI writer.
No LLM calls anywhere here — selection is plain token overlap."""

import pytest
from django_tenants.utils import schema_context

from apps.blog import curated
from apps.core.models import CuratedPhoto

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def catalog(tenant_ctx):
    with schema_context("public"):
        rows = {
            "run": CuratedPhoto.objects.create(
                title="Sunrise run",
                tags="fitness, running, morning",
                kind="hero",
                alt_text="runner at sunrise",
                image_key="platform/curated-photos/run.png",
            ),
            "meal": CuratedPhoto.objects.create(
                title="Meal prep",
                tags="cooking, nutrition",
                kind="stock",
                image_key="platform/curated-photos/meal.png",
            ),
            "texture": CuratedPhoto.objects.create(
                title="Fitness texture",
                tags="fitness",
                kind="texture",
                image_key="platform/curated-photos/tex.png",
            ),
            "disabled": CuratedPhoto.objects.create(
                title="Old fitness",
                tags="fitness",
                kind="hero",
                enabled=False,
                image_key="platform/curated-photos/old.png",
            ),
        }
    return rows


def test_candidates_match_topic_tokens_and_exclude_non_ai_kinds(catalog):
    cands = curated.curated_candidates("5 fitness running mistakes")
    ids = [c.id for c in cands]
    assert f"curated:{catalog['run'].pk}" in ids
    assert f"curated:{catalog['texture'].pk}" not in ids  # texture never offered to AI
    assert f"curated:{catalog['disabled'].pk}" not in ids
    assert all(c.id.startswith(curated.CURATED_PREFIX) for c in cands)


def test_candidates_fall_back_to_heroes_when_nothing_matches(catalog):
    cands = curated.curated_candidates("tamamen türkçe bir başlık")
    assert cands  # language mismatch still yields generic hero covers
    assert all(c.id == f"curated:{catalog['run'].pk}" for c in cands)


def test_candidates_respect_limit(catalog):
    assert curated.curated_candidates("fitness", limit=1)
    assert len(curated.curated_candidates("fitness", limit=1)) == 1
    assert curated.curated_candidates("fitness", limit=0) == []


def test_resolve_materializes_and_replaces_ids(catalog):
    from apps.media.models import Photo

    fields = {
        "cover_photo_id": f"curated:{catalog['run'].pk}",
        "image_placements": [
            {"heading": "Fuel", "photo_id": f"curated:{catalog['meal'].pk}"},
            {"heading": "Bogus", "photo_id": "curated:999999"},
        ],
    }
    curated.resolve_curated_photo_ids(fields)
    photo = Photo.objects.get(s3_key="platform/curated-photos/run.png")
    assert fields["cover_photo_id"] == str(photo.id)
    assert len(fields["image_placements"]) == 1
    assert fields["image_placements"][0]["heading"] == "Fuel"
    meal = Photo.objects.get(s3_key="platform/curated-photos/meal.png")
    assert fields["image_placements"][0]["photo_id"] == str(meal.id)


def test_resolve_leaves_tenant_photo_ids_alone(catalog):
    fields = {"cover_photo_id": "0b6beec4-8e42-4f47-a94c-9d1e9a1e2f3a", "image_placements": []}
    curated.resolve_curated_photo_ids(fields)
    assert fields["cover_photo_id"] == "0b6beec4-8e42-4f47-a94c-9d1e9a1e2f3a"
