"""The platform blog per language: a post has one, the list filters on it, generate writes in it."""

from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.blog import ai
from apps.core.models import PlatformBlogPost

pytestmark = pytest.mark.django_db

HOST = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean():
    PlatformBlogPost.objects.all().delete()
    yield
    PlatformBlogPost.objects.all().delete()


def _post(slug, language=None, status="published"):
    extra = {"language": language} if language else {}
    return PlatformBlogPost.objects.create(
        title=slug, slug=slug, status=status, published_at=timezone.now(), body_html="<p>x</p>", **extra
    )


def _slugs(res):
    return [row["slug"] for row in res.data["results"]]


def test_a_post_is_english_unless_said_otherwise(restore_public):
    assert _post("a").language == "en"


def test_the_list_shows_only_the_asked_language(restore_public):
    _post("en-post")
    _post("tr-post", "tr")
    _post("tr-draft", "tr", status="draft")
    client = APIClient(HTTP_HOST=HOST)
    assert _slugs(client.get("/api/v1/platform/blog/posts/?language=tr")) == ["tr-post"]
    assert _slugs(client.get("/api/v1/platform/blog/posts/?language=en")) == ["en-post"]
    assert _slugs(client.get("/api/v1/platform/blog/posts/?language=pl")) == []


def test_no_language_lists_every_post(restore_public):
    _post("en-post")
    _post("tr-post", "tr")
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/platform/blog/posts/")
    assert sorted(_slugs(res)) == ["en-post", "tr-post"]


def test_a_hidden_language_lists_english(restore_public, settings):
    settings.ENABLED_LOCALES = ["en", "tr"]
    _post("en-post")
    _post("pl-post", "pl")
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/platform/blog/posts/?language=pl")
    assert _slugs(res) == ["en-post"]


def test_the_detail_names_its_language(restore_public):
    _post("tr-post", "tr")
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/platform/blog/posts/tr-post/")
    assert res.data["language"] == "tr"


def _generate(language=None):
    admin = User.objects.create(email="root@bloglang.com", region="global", role="owner", is_superuser=True)
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=admin)
    result = ai.DraftResult(
        {"title": "T", "body_html": "<p>b</p>", "excerpt": "e", "meta_description": "m", "tags": [], "ai_model": "x"},
        Decimal("0.01"),
    )
    body = {"topic": "why creators need a website", **({"language": language} if language else {})}
    with mock.patch.object(ai, "generate_post", return_value=result) as gen:
        res = client.post("/api/v1/platform/blog/generate/", body, format="json")
    return res, gen


def test_generate_writes_in_the_asked_language(restore_public):
    res, gen = _generate("tr")
    assert res.status_code == 200
    assert gen.call_args.kwargs["language"] == "tr"
    assert res.data["post"]["language"] == "tr"
    assert PlatformBlogPost.objects.get(slug=res.data["post"]["slug"]).language == "tr"


def test_generate_defaults_to_english(restore_public):
    res, gen = _generate()
    assert gen.call_args.kwargs["language"] == "en"
    assert res.data["post"]["language"] == "en"


def test_generate_rejects_an_unknown_language(restore_public):
    res, gen = _generate("xx")
    assert res.status_code == 400
    gen.assert_not_called()


def test_the_list_can_be_cut_to_one_post(restore_public):
    _post("one", "tr")
    _post("two", "tr")
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/platform/blog/posts/?language=tr&page_size=1")
    assert (len(res.data["results"]), res.data["count"]) == (1, 2)
