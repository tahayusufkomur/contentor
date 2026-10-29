"""Task 2.3: the alt text stored with a catalog photo follows the site's language."""

import json
from types import SimpleNamespace
from unittest import mock

import pytest

from apps.core import ai as core_ai
from apps.core.curated_images import cache
from apps.core.curated_images.client import RemoteImage
from apps.core.onboarding import site_composer
from apps.media.models import Photo
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def image(n=1, description="A woman stretching on a yoga mat"):
    return RemoteImage(
        asset_id=f"a{n}",
        title="Stretch",
        description=description,
        tags=[],
        width=1600,
        height=900,
        preview_url="http://x/p.webp",
        web_url="http://x/y.webp",
    )


@pytest.fixture()
def model(monkeypatch):
    """Turkish "translation": every text prefixed with tr:, one call recorded per batch."""
    calls = []

    def fake(**kwargs):
        calls.append(kwargs)
        texts = json.loads(kwargs["user"])
        return SimpleNamespace(texts=[f"tr:{t}" if t else t for t in texts]), 0, "fake"

    monkeypatch.setattr(core_ai, "structured", fake)
    return calls


@pytest.fixture()
def storage(monkeypatch):
    monkeypatch.setattr(cache, "_download", lambda image: b"x")
    with mock.patch("apps.core.platform.uploads._store_object"):
        yield


def site_in(locale):
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Glow", default_locale=locale)


def test_translate_descriptions_is_the_identity_in_english(model):
    assert cache.translate_descriptions(["a", "b"], "en") == ["a", "b"]
    assert model == []


def test_translate_descriptions_is_one_call_with_the_same_order_and_length(model):
    assert cache.translate_descriptions(["a", "", "c"], "tr") == ["tr:a", "", "tr:c"]
    assert len(model) == 1 and model[0]["language"] == "tr"


def test_a_short_answer_keeps_the_english(monkeypatch):
    monkeypatch.setattr(core_ai, "structured", lambda **k: (SimpleNamespace(texts=["only one"]), 0, "fake"))
    assert cache.translate_descriptions(["a", "b"], "tr") == ["a", "b"]


def test_a_turkish_site_stores_the_translated_description(tenant_ctx, storage, model):
    site_in("tr")
    photo = cache.cache_remote_image(image())
    assert photo.alt_text == "tr:A woman stretching on a yoga mat"
    assert Photo.objects.get(pk=photo.pk).alt_text == photo.alt_text


def test_an_english_site_keeps_the_catalog_words(tenant_ctx, storage, model):
    site_in("en")
    assert cache.cache_remote_image(image(2)).alt_text == "A woman stretching on a yoga mat"
    assert model == []


def test_the_composer_translates_a_pages_alt_texts_in_one_call(tenant_ctx, storage, model):
    site_in("tr")
    photos = [cache.cache_remote_image(image(n, f"photo {n}"), translate=False) for n in (3, 4)]
    assert [p.alt_text for p in photos] == ["photo 3", "photo 4"] and model == []
    slots = [{"alt": f"photo {n}"} for n in (3, 4)] + [{"alt": "face yoga"}]
    site_composer._alt_in_site_language(
        [(slots[0], photos[0], "photo 3"), (slots[1], photos[1], "photo 4"), (slots[2], photos[0], "")], "tr"
    )
    assert len(model) == 1
    assert [s["alt"] for s in slots] == ["tr:photo 3", "tr:photo 4", "tr:face yoga"]
    assert Photo.objects.get(pk=photos[0].pk).alt_text == "tr:photo 3"
    site_composer._alt_in_site_language([(slots[0], photos[0], "photo 3")], "en")
    assert len(model) == 1
