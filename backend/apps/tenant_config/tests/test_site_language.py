"""A site's language changes until it goes live (apps.tenant_config.site_language); the superadmin can force it."""

from datetime import timedelta
from unittest import mock

import pytest
from django.core.cache import cache
from django.utils import timezone
from django.utils.translation import gettext, override
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.blog.models import BlogPost
from apps.core.models import Tenant
from apps.email_campaigns.models import EmailTemplate, TemplateSource
from apps.tenant_config import site_language
from apps.tenant_config.models import SeededObject, TenantConfig
from apps.tenant_config.seeding import register_seeded

pytestmark = pytest.mark.django_db

HOST = "shared-test.localhost"
URL = "/api/v1/admin/config/site-language/"
LOCKED = "Your site is live, so its language stays as it is."


def _text(code, msgid):
    with override(code):
        return gettext(msgid)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@site-language.test",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.default_locale = "en"
    cfg.setup_flow = {"status": "active", "step": "course", "done": [], "skipped": []}
    cfg.navbar_config = {
        "links": [{"label": "Courses", "href": "/courses"}, {"label": "My classes", "href": "/events"}],
        "cta": {"text": "Start a course", "href": "/courses"},
    }
    cfg.save()
    cache.set(f"tenant:{tenant_ctx.schema_name}:config", "stale")
    return cfg


@pytest.fixture()
def client(owner, config):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=owner)
    return c


@pytest.fixture()
def queue():
    """The Celery queue and the page builds, faked: nothing is run."""
    with (
        mock.patch("apps.tenant_config.setup_flow.start_page_build") as pages,
        mock.patch("apps.core.tasks.interview_draft_task.delay") as drafts,
        mock.patch("apps.core.tasks.regenerate_starter_post.delay") as post,
    ):
        yield mock.Mock(pages=pages, drafts=drafts, post=post)


def _stored(config):
    config.refresh_from_db()
    return config.default_locale


def test_a_change_before_go_live_saves_and_queues_the_redraft(
    client, config, tenant_ctx, queue, django_capture_on_commit_callbacks
):
    config.setup_flow = {
        **config.setup_flow,
        "page_builds": {"home": {"status": "ready"}, "about": {"status": "idle"}},
        "drafts": {"course": 7, "plans": {"gold": 3}},
    }
    config.save()
    with django_capture_on_commit_callbacks(execute=True):
        resp = client.post(URL, {"language": "tr"}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json() == {"language": "tr", "locked": False}
    assert _stored(config) == "tr"
    assert cache.get(f"tenant:{tenant_ctx.schema_name}:config") is None
    queue.pages.assert_called_once()  # the built page only, not the idle one
    assert queue.pages.call_args.args[1] == "home"
    queue.drafts.assert_called_once()  # the course draft only: "plans" is not a draft kind
    assert queue.drafts.call_args.args[:2] == (tenant_ctx.id, "course")


def test_a_live_site_answers_409_with_the_message(client, config, tenant_ctx, queue):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(is_published=True)
    resp = client.post(URL, {"language": "tr"}, format="json")
    assert resp.status_code == 409
    assert resp.json()["detail"] == LOCKED
    assert _stored(config) == "en"
    queue.pages.assert_not_called()


def test_unpublishing_does_not_unlock(client, config, queue):
    config.setup_flow = {**config.setup_flow, "status": "done", "completed_at": timezone.now().isoformat()}
    config.save()  # went live once; the Tenant is unpublished again
    assert client.get(URL).json()["locked"] is True
    assert client.post(URL, {"language": "tr"}, format="json").status_code == 409
    assert _stored(config) == "en"


def test_a_language_that_is_not_enabled_is_refused(client, config, queue, settings):
    settings.ENABLED_LOCALES = ["en"]
    assert client.post(URL, {"language": "pl"}, format="json").status_code == 400
    assert _stored(config) == "en"


def test_only_the_owner_may_change_it(config, queue):
    student = User.objects.create_user(email="s@site-language.test", name="S", password="x", role="student")  # noqa: S106
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=student)
    assert c.post(URL, {"language": "tr"}, format="json").status_code == 403


def test_the_superadmin_forces_a_live_site_and_nothing_is_redrafted(config, tenant_ctx, queue):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(is_published=True)
    tenant_ctx.refresh_from_db()
    config.setup_flow = {**config.setup_flow, "page_builds": {"home": {"status": "ready"}}}
    config.save()
    with pytest.raises(site_language.SiteLanguageLocked):
        site_language.change(tenant_ctx, "tr")
    site_language.change(tenant_ctx, "tr", force=True)
    assert _stored(config) == "tr"
    queue.pages.assert_not_called()
    queue.drafts.assert_not_called()
    queue.post.assert_not_called()


def test_the_platform_patch_forces_it(config, tenant_ctx, queue):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(is_published=True)
    su = User.objects.create_superuser(email="su@site-language.test", password="x")  # noqa: S106
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=su)
    resp = c.patch(f"/api/v1/platform/tenants/{tenant_ctx.slug}/", {"default_locale": "de"}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["site_language"] == {"code": "de", "locked": True}
    assert _stored(config) == "de"
    queue.pages.assert_not_called()


def test_the_headers_default_texts_follow_the_language_and_her_own_wording_stays(config, tenant_ctx, queue):
    config.navbar_config = {
        "links": [
            {"label": _text("de", "Courses"), "href": "/courses"},  # a default, written in another language
            {"label": "My classes", "href": "/events"},  # hers
        ],
        "cta": {"text": "Get Started", "href": "/courses"},  # the legacy default
    }
    config.save()
    site_language.change(tenant_ctx, "tr")
    nav = TenantConfig.objects.first().navbar_config
    assert [link["label"] for link in nav["links"]] == [_text("tr", "Courses"), "My classes"]
    assert nav["cta"] == {"text": _text("tr", "Start a course"), "href": "/courses"}

    # her own button text is kept, whatever the language
    config.navbar_config = {**nav, "cta": {"text": "Join the club", "href": "/courses"}}
    config.save()
    site_language.change(tenant_ctx, "pl")
    assert TenantConfig.objects.first().navbar_config["cta"]["text"] == "Join the club"


def test_starter_emails_she_never_edited_are_made_again_and_an_edited_one_stays(config, tenant_ctx, queue):
    config.setup_flow = {**config.setup_flow, "email_starters": True}
    config.save()
    from apps.email_campaigns import starters

    first = starters.recipes(tenant_ctx)
    for r in first:
        EmailTemplate.objects.create(
            name=r["name"],
            category=r["category"],
            design=r["design"],
            subject=r["subject"],
            source=TemplateSource.STARTER,
        )
    kept = EmailTemplate.objects.filter(source=TemplateSource.STARTER).order_by("pk").first()
    EmailTemplate.objects.filter(pk=kept.pk).update(updated_at=kept.created_at + timedelta(hours=1))  # she edited it
    site_language.change(tenant_ctx, "tr")
    rows = EmailTemplate.objects.filter(source=TemplateSource.STARTER)
    assert rows.count() == len(first)
    assert rows.filter(pk=kept.pk).exists()
    assert rows.exclude(pk=kept.pk).exclude(subject__in=[r["subject"] for r in first]).count() == len(first) - 1
    assert TenantConfig.objects.first().setup_flow["email_starters"] is True


def _post():
    post = BlogPost.objects.create(slug="welcome", title="Welcome", body_html="<p>Hi</p>", status="draft", source="ai")
    register_seeded([post])
    return post


def test_the_first_post_is_regenerated_only_while_unpublished_and_unedited(config, tenant_ctx, queue):
    post = _post()
    site_language.change(tenant_ctx, "tr")
    queue.post.assert_called_once_with(tenant_ctx.id)

    queue.post.reset_mock()
    BlogPost.objects.filter(pk=post.pk).update(title="My own title")  # she edited it
    site_language.change(tenant_ctx, "de")
    queue.post.assert_not_called()

    BlogPost.objects.filter(pk=post.pk).update(title="Welcome", status="published")
    SeededObject.objects.all().delete()
    register_seeded([BlogPost.objects.get(pk=post.pk)])
    site_language.change(tenant_ctx, "pl")
    queue.post.assert_not_called()  # published


def test_the_regeneration_task_swaps_the_post_after_the_new_one_is_written(config, tenant_ctx):
    from apps.core import tasks

    _post()
    new = {
        "title": "Hos geldin",
        "body_html": "<p>Merhaba</p>",
        "excerpt": "x",
        "meta_description": "x",
        "tags": [],
        "ai_model": "fake",
        "image_placements": [],
    }
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_curate.CoachBrief.from_tenant", return_value=mock.Mock()),
        mock.patch("apps.core.onboarding.starter_post.generate_starter_draft", return_value=new) as gen,
    ):
        tasks.regenerate_starter_post(tenant_ctx.id)
    assert gen.call_args.kwargs["language"] == "en"  # the stored language of the site
    assert list(BlogPost.objects.values_list("title", flat=True)) == ["Hos geldin"]
