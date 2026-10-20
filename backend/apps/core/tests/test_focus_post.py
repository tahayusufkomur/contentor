"""The post job (apps.core.focus.post, G2): the review step's drafting for a
blog post. The blog generator writes the post in one call, on her blog quota
and the blog model; each field is written only while it is blank or still
holds what the job last wrote, and each is emitted as a ``field`` event the
page types in. The model call is patched; what is under test is what gets
written (her edits win), the events, the quota and the failure path.

There is no post adapter yet (G3): the creation is built here directly, and
the working title (``flow.draft_title``, which asks the adapter) is patched."""

from decimal import Decimal
from unittest import mock

import pytest
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.blog import ai as blog_ai
from apps.blog.models import BlogPost
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.focus import jobs, post
from apps.core.models import PlatformPlan, PlatformSubscription
from apps.media.models import Photo
from apps.tenant_config.models import CopilotChat, CopilotRun, FocusCreation, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"
PLAN = "Focus Post Test Paid"
WORKING = "Morning breath"
KEPT = "You changed the text, so I left it; the title and summary are new."


@pytest.fixture()
def owner(tenant_ctx):
    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Studio")
    return User.objects.create_user(
        email="focus-post@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def paid(tenant_ctx, settings):
    """A plan with five AI blog posts a month, and a provider configured."""
    settings.ANTHROPIC_API_KEY = "test-key"
    with schema_context("public"):
        plan = PlatformPlan.objects.create(name=PLAN, price_monthly=19, transaction_fee_pct=5, max_ai_blog_posts=5)
        payer = User.objects.create_user(email="focus-post-payer@x.com", name="P", password="x", role="owner")  # noqa: S106
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=payer, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    yield tenant_ctx
    with schema_context(SCHEMA):  # the subscription's cascade reaches tenant tables (billing_payment)
        PlatformSubscription.objects.filter(plan=plan).delete()
        plan.delete()
        User.objects.filter(email="focus-post-payer@x.com").delete()


@pytest.fixture(autouse=True)
def quiet():
    with (
        mock.patch.object(tasks.run_focus_job, "delay"),
        mock.patch("apps.core.focus.flow.draft_title", return_value=WORKING),  # G3: drop once the adapter exists
    ):
        yield


def _creation(owner, **answers):
    record = BlogPost.objects.create(title=WORKING, slug="morning-breath", status="draft", source="ai")
    chat = CopilotChat.objects.create(actor=owner, title=f"New post: {WORKING}")
    return FocusCreation.objects.create(
        kind="post",
        actor=owner,
        chat=chat,
        record_id=record.pk,
        answers={"topic": "A post on morning breath", "length": "short", **answers},
        brief={"notes": "For busy parents."},
    )


def _draft(title="Breathe before the day starts", photo=None, intro="Three slow breaths change a morning."):
    return blog_ai._BlogDraft(
        title=title,
        slug="x",
        meta_description="A short morning breath routine for busy parents.",
        excerpt="A calmer start in three slow breaths.",
        tags=["Breath", "mornings"],
        sections=[
            blog_ai._Section(heading="", body_markdown=intro),
            blog_ai._Section(
                heading="Why mornings", body_markdown="The day has not pulled at you yet.", photo_id=photo
            ),
        ],
    )


def _model(draft=None, cost="0.04", **kwargs):
    if "side_effect" not in kwargs:
        kwargs["return_value"] = (draft or _draft(photo=""), Decimal(cost), "claude-sonnet-5")
    return mock.patch("apps.blog.ai.core_ai.structured", **kwargs)


def _fields(run_id):
    return [e.data for e in CopilotRun.objects.get(pk=run_id).events.filter(type="field")]


def _row(creation):
    return BlogPost.objects.get(pk=creation.record_id)


def test_the_post_is_written_field_by_field(owner, paid):
    photo = Photo.objects.create(s3_key="k", title="Sunrise stretch")
    creation = _creation(owner)
    run = post.start(creation)
    assert run.specialist == "marketing"
    assert run.request == {"focus": creation.id, "job": "post", "instruction": ""}
    assert creation.runs["post"] == run.id and jobs.status(creation, "post") == "building"
    with _model(_draft(photo=str(photo.id))) as model:
        jobs.execute(SCHEMA, run.id)
    assert model.call_args.kwargs["label"] == "contentor:copilot"
    user = model.call_args.kwargs["user"]
    assert "Write a blog post about: A post on morning breath" in user
    assert "about 500 words" in user and "For busy parents." in user
    assert f'{photo.id}: "Sunrise stretch"' in user  # her own photos are offered, as blog_generate does

    row = _row(creation)
    assert (row.title, row.status, row.slug) == ("Breathe before the day starts", "draft", "morning-breath")
    assert row.excerpt == "A calmer start in three slow breaths."
    assert row.meta_description == "A short morning breath routine for busy parents."
    assert row.tags == ["breath", "mornings"]
    assert row.body_html.startswith("<p>Three slow breaths change a morning.</p>")
    # Inline images follow the generator's own placement; the cover is the cover step's (G3).
    assert row.image_placements == [{"heading": "Why mornings", "photo_id": str(photo.id)}]
    assert row.cover_photo_id is None
    key = f"post:{row.pk}"
    assert _fields(run.id) == [
        {"record": key, "name": "title", "value": row.title},
        {"record": key, "name": "excerpt", "value": row.excerpt},
        {"record": key, "name": "body_html", "value": row.body_html},
        {"record": key, "name": "meta_description", "value": row.meta_description},
        {"record": key, "name": "tags", "value": row.tags},
    ]
    creation.refresh_from_db()
    assert creation.drafted["post"] == {
        "title": row.title,
        "excerpt": row.excerpt,
        "body_html": row.body_html,
        "meta_description": row.meta_description,
        "tags": row.tags,
    }
    assert jobs.status(creation, "post") == "ready"
    assert CopilotChat.objects.get(pk=creation.chat_id).entries == []  # nothing of hers was kept: nothing to say


def test_a_redraft_keeps_the_paragraphs_she_edited(owner, paid):
    creation = _creation(owner)
    with _model():
        jobs.execute(SCHEMA, post.start(creation).id)
    first = _row(creation)
    BlogPost.objects.filter(pk=first.pk).update(body_html="<p>My own words about it.</p>")
    creation.refresh_from_db()
    redraft = post.start(creation, instruction="a warmer title")
    assert redraft.request["instruction"] == "a warmer title"
    with _model(_draft("Warm up your mornings", photo="", intro="Something else entirely.")) as model:
        jobs.execute(SCHEMA, redraft.id)
    assert "a warmer title" in model.call_args.kwargs["user"]
    row = _row(creation)
    assert (row.title, row.body_html) == ("Warm up your mornings", "<p>My own words about it.</p>")
    assert [f["name"] for f in _fields(redraft.id)] == ["title"]  # the rest came back the same
    creation.refresh_from_db()
    assert creation.drafted["post"]["body_html"] == first.body_html  # still what the job last wrote
    assert creation.drafted["post"]["title"] == "Warm up your mornings"
    # The guide says so, in the dock and on the run.
    assert CopilotChat.objects.get(pk=creation.chat_id).entries == [{"role": "assistant", "text": KEPT}]
    assert CopilotRun.objects.get(pk=redraft.id).result == {"fields": ["title"], "text": KEPT}


def test_a_failed_post_offers_try_again(owner, paid):
    creation = _creation(owner)
    failed = post.start(creation, instruction="shorter please")
    with _model(side_effect=core_ai.AiError("down", cost_usd=Decimal("0.02"))):
        jobs.execute(SCHEMA, failed.id)
    row = _row(creation)
    assert (row.title, row.body_html, row.excerpt) == (WORKING, "", "")
    creation.refresh_from_db()
    assert jobs.status(creation, "post") == "failed" and "post" not in (creation.drafted or {})
    usage = blog_ai.tenant_usage(SCHEMA)
    assert (usage.usd_spent, usage.generations_used) == (Decimal("0.02"), 0)  # spent, but no post: no credit

    # Try again (the copy job's: the review's "retry" starts the drafting again, with her change).
    retry = post.start(creation, instruction=failed.request["instruction"])
    assert retry.id != failed.id and jobs.status(creation, "post") == "building"
    with _model():
        jobs.execute(SCHEMA, retry.id)
    assert _row(creation).title == "Breathe before the day starts"
    assert blog_ai.tenant_usage(SCHEMA).generations_used == 1


def test_the_post_uses_the_blog_model_and_counts_against_the_blog_quota(owner, paid, settings):
    settings.BLOG_AI_MODEL = "claude-blog-model"
    creation = _creation(owner, length="standard")
    run = post.start(creation)
    with (
        _model(cost="0.05") as model,
        mock.patch("apps.core.onboarding.ai_compose.record_spend") as onboarding_spend,
    ):
        jobs.execute(SCHEMA, run.id)
    kwargs = model.call_args.kwargs
    assert (kwargs["model"], kwargs["system"]) == ("claude-blog-model", blog_ai.BLOG_STATIC_PROMPT)
    assert "words" not in kwargs["user"].split("The coach's extra instructions:")[1]  # standard: the prompt's own
    usage = blog_ai.tenant_usage(SCHEMA)
    assert (usage.usd_spent, usage.generations_used) == (Decimal("0.05"), 1)
    onboarding_spend.assert_not_called()  # the blog meter, not the onboarding one

    # Out of posts this month: no model call, and the run says why.
    blog_ai.BlogAiUsage.objects.filter(pk=usage.pk).update(generations_used=5)
    again = post.start(creation, instruction="again")
    with _model() as model:
        jobs.execute(SCHEMA, again.id)
    model.assert_not_called()
    again.refresh_from_db()
    assert again.status == "failed" and again.result == {"reason": "quota_exhausted"}
    creation.refresh_from_db()
    assert jobs.status(creation, "post") == "failed"
