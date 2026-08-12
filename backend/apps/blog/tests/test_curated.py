"""Curated-candidate selection + id resolution for the blog AI writer.

No LLM calls anywhere here — candidates come from the remote curated catalog,
which the conftest keeps in offline fixture mode. Spec:
docs/superpowers/specs/2026-08-09-curated-images-offload-design.md
"""

import pytest

from apps.blog import curated
from apps.core.curated_images import client as curated_client
from apps.core.curated_images import fake

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def fixtures():
    """The fixture catalog keyed by filename stem, so assertions read like the
    catalog rather than like UUIDs."""
    return {entry["file"].removesuffix(".webp"): entry for entry in fake.entries()}


def test_candidates_are_namespaced_and_topic_ranked(tenant_ctx, fixtures):
    cands = curated.curated_candidates("5 yoga studio mistakes")
    assert cands
    assert all(c.id.startswith(curated.CURATED_PREFIX) for c in cands)
    assert "yoga" in cands[0].title.lower()


def test_candidates_fall_back_when_nothing_matches(tenant_ctx):
    cands = curated.curated_candidates("tamamen türkçe bir başlık")
    assert cands  # language mismatch still yields generic covers
    assert len(cands) <= curated._FALLBACK_CANDIDATES


def test_candidates_respect_limit(tenant_ctx):
    assert len(curated.curated_candidates("fitness", limit=1)) == 1
    assert curated.curated_candidates("fitness", limit=0) == []


def test_candidates_survive_a_catalog_outage(tenant_ctx, monkeypatch):
    def _down(*args, **kwargs):
        raise curated_client.CuratedImageError("the photo library is unavailable right now")

    monkeypatch.setattr(curated_client, "search", _down)
    assert curated.curated_candidates("anything") == []


def test_resolve_caches_into_tenant_storage_and_replaces_ids(tenant_ctx, fixtures, curated_image_uploads):
    from apps.media.models import Photo

    cover = fixtures["hero_fitness_gym_workout"]["asset_id"]
    inline = fixtures["stock_cooking_pasta_toss"]["asset_id"]
    fields = {
        "cover_photo_id": f"curated:{cover}",
        "image_placements": [
            {"heading": "Fuel", "photo_id": f"curated:{inline}"},
            {"heading": "Bogus", "photo_id": "curated:11111111-2222-3333-4444-555555555555"},
        ],
    }
    curated.resolve_curated_photo_ids(fields)

    photo = Photo.objects.get(pk=fields["cover_photo_id"])
    assert photo.s3_key.endswith(f"/curated/{cover}.webp")
    assert photo.s3_key.startswith("tenants/")  # the tenant's own namespace
    assert photo.content_type == "image/webp" and photo.file_size > 0
    assert curated_image_uploads[photo.s3_key]  # bytes were stored, not referenced

    assert len(fields["image_placements"]) == 1  # unknown id dropped
    assert fields["image_placements"][0]["heading"] == "Fuel"
    assert Photo.objects.get(pk=fields["image_placements"][0]["photo_id"]).s3_key.endswith(f"{inline}.webp")


def test_resolve_reuses_an_already_cached_copy(tenant_ctx, fixtures):
    from apps.media.models import Photo

    asset_id = fixtures["hero_fitness_gym_workout"]["asset_id"]
    first = {"cover_photo_id": f"curated:{asset_id}", "image_placements": []}
    second = {"cover_photo_id": f"curated:{asset_id}", "image_placements": []}
    curated.resolve_curated_photo_ids(first)
    curated.resolve_curated_photo_ids(second)
    assert first["cover_photo_id"] == second["cover_photo_id"]
    assert Photo.objects.filter(s3_key__endswith=f"{asset_id}.webp").count() == 1


def test_resolve_drops_a_photo_it_cannot_cache(tenant_ctx, fixtures, monkeypatch):
    def _down(*args, **kwargs):
        raise curated_client.CuratedImageError("that photo could not be saved to your library")

    # blog.curated imports the helper by name at module import time.
    monkeypatch.setattr("apps.blog.curated.cache_remote_image", _down)
    fields = {"cover_photo_id": f"curated:{fixtures['hero_fitness_gym_workout']['asset_id']}", "image_placements": []}
    curated.resolve_curated_photo_ids(fields)
    assert fields["cover_photo_id"] == ""


def test_resolve_leaves_tenant_photo_ids_alone(tenant_ctx):
    fields = {"cover_photo_id": "0b6beec4-8e42-4f47-a94c-9d1e9a1e2f3a", "image_placements": []}
    curated.resolve_curated_photo_ids(fields)
    assert fields["cover_photo_id"] == "0b6beec4-8e42-4f47-a94c-9d1e9a1e2f3a"
