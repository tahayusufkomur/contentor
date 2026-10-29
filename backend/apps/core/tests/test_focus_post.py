"""The post job (apps.core.focus.post, G2): the review step's drafting for a
blog post. The blog generator writes the post in one call, on her blog quota
and the blog model; each field is written only while it is blank or still
holds what the job last wrote, and each is emitted as a ``field`` event the
page types in. The model call is patched; what is under test is what gets
written (her edits win), the events, the quota and the failure path. Then the
post's recipe (kinds/post.py, G3) through the flow: its draft, the job as its
review's drafting, the blog gate said at once, and its finish."""

from decimal import Decimal
from unittest import mock

import pytest
from django.db import transaction
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.blog import ai as blog_ai
from apps.blog import curated
from apps.blog.models import BlogPost, BlogTopicIdea, unique_slug
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.focus import flow, jobs, kinds, post
from apps.core.focus.kinds import post as recipe
from apps.core.models import PlatformPlan, PlatformSubscription
from apps.media.models import Photo
from apps.tenant_config.models import CopilotChat, CopilotRun, FocusCreation, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"
PLAN = "Focus Post Test Paid"
WORKING = "Morning breath"
KEPT = "You changed the text, so I left it; the title and summary are new."
ALL_KEPT = "You changed all of it, so I left it as it is."
SOME_KEPT = "You changed some of it, so I left those parts as you wrote them."


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
    with mock.patch.object(tasks.run_focus_job, "delay"):
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
        brief={
            "notes": "For busy parents.",
            "followups": [{"question": "Who is it for?", "answer": "New students", "slot": "draft"}],
        },
    )


def _draft(
    title="Breathe before the day starts",
    photo="",
    intro="Three slow breaths change a morning.",
    excerpt="A calmer start in three slow breaths.",
    tags=("Breath", "mornings"),
):
    return blog_ai._BlogDraft(
        title=title,
        slug="x",
        meta_description="A short morning breath routine for busy parents.",
        excerpt=excerpt,
        tags=list(tags),
        sections=[
            blog_ai._Section(heading="", body_markdown=intro),
            blog_ai._Section(
                heading="Why mornings", body_markdown="The day has not pulled at you yet.", photo_id=photo
            ),
        ],
    )


def _catalog_photo(n=0):
    """The nth catalog photo the job offers for her topic (the offline fake catalog)."""
    return curated.curated_candidates("A post on morning breath")[n].id


def _model(draft=None, cost="0.04", **kwargs):
    if "side_effect" not in kwargs:
        kwargs["return_value"] = (draft or _draft(), Decimal(cost), "claude-sonnet-5")
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
    assert "Who is it for? New students" in user  # her follow-up answer reaches the post
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
    assert row.ai_model == "claude-sonnet-5"  # written by the model, as a Generate draft says
    key = f"post:{row.pk}"
    shown = kinds.get("post").payload(row)
    assert key == f"{shown['kind']}:{shown['id']}"  # the page's live record key (useLiveRecord)
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
    photo = Photo.objects.create(s3_key="k", title="Sunrise stretch")
    placed = [{"heading": "Why mornings", "photo_id": str(photo.id)}]
    creation = _creation(owner)
    with _model(_draft(photo=str(photo.id))):
        jobs.execute(SCHEMA, post.start(creation).id)
    first = _row(creation)
    assert first.image_placements == placed
    BlogPost.objects.filter(pk=first.pk).update(body_html="<p>My own words about it.</p>")
    creation.refresh_from_db()
    redraft = post.start(creation, instruction="a warmer title")
    assert redraft.request["instruction"] == "a warmer title"
    warmer = _draft("Warm up your mornings", intro="Something else.", excerpt="Warm mornings, slowly.")
    with _model(warmer) as model:
        jobs.execute(SCHEMA, redraft.id)
    assert "a warmer title" in model.call_args.kwargs["user"]
    row = _row(creation)
    assert (row.title, row.excerpt) == ("Warm up your mornings", "Warm mornings, slowly.")
    assert row.body_html == "<p>My own words about it.</p>"
    assert row.image_placements == placed  # the images go with the text, and the text is hers
    assert [f["name"] for f in _fields(redraft.id)] == ["title", "excerpt"]  # the rest came back the same
    creation.refresh_from_db()
    assert creation.drafted["post"]["body_html"] == first.body_html  # still what the job last wrote
    # The guide says so, in the dock and on the run.
    assert CopilotChat.objects.get(pk=creation.chat_id).entries == [{"role": "assistant", "text": KEPT}]
    assert CopilotRun.objects.get(pk=redraft.id).result == {"fields": ["title", "excerpt"], "text": KEPT}

    # She changes the summary and the tags too; the next draft brings new ones and places a catalog photo.
    BlogPost.objects.filter(pk=first.pk).update(excerpt="My own summary.", tags=["mine"])
    creation.refresh_from_db()
    again = post.start(creation, instruction="calmer")
    calmer = _draft("Calm mornings", photo=_catalog_photo(), excerpt="A new summary.", tags=("new", "tags"))
    with _model(calmer):
        jobs.execute(SCHEMA, again.id)
    row = _row(creation)
    assert (row.title, row.excerpt, row.tags) == ("Calm mornings", "My own summary.", ["mine"])
    assert (row.body_html, row.image_placements) == ("<p>My own words about it.</p>", placed)
    assert [f["name"] for f in _fields(again.id)] == ["title"]
    assert CopilotRun.objects.get(pk=again.id).result["text"] == SOME_KEPT  # never "the summary is new"


def test_a_kept_body_redraft_adds_no_photos(owner, paid):
    creation = _creation(owner)
    with _model(_draft(photo=_catalog_photo())):
        jobs.execute(SCHEMA, post.start(creation).id)
    row = _row(creation)
    copied = Photo.objects.get()  # the catalog photo it placed, copied into her library with the text
    assert row.image_placements == [{"heading": "Why mornings", "photo_id": str(copied.id)}]
    BlogPost.objects.filter(pk=row.pk).update(body_html="<p>Mine.</p>")
    creation.refresh_from_db()
    with _model(_draft("Another title", photo=_catalog_photo(1), intro="Other words.")):  # one not copied yet
        jobs.execute(SCHEMA, post.start(creation, instruction="again").id)
    assert Photo.objects.count() == 1  # her text stays, so nothing it would have placed is copied
    assert _row(creation).image_placements == row.image_placements


def test_catalog_photos_are_copied_before_the_locks(owner, paid):
    """A slow catalog download never holds her autosave, Stop or taps (they wait on the same rows)."""
    from django.db import connection

    copy = curated.resolve_curated_photo_ids
    locked = []

    def watched(fields):
        locked.append(connection.in_atomic_block)
        return copy(fields)

    creation = _creation(owner)
    with _model(_draft(photo=_catalog_photo())), mock.patch.object(curated, "resolve_curated_photo_ids", watched):
        jobs.execute(SCHEMA, post.start(creation).id)
    assert locked == [False]
    assert _row(creation).image_placements == [{"heading": "Why mornings", "photo_id": str(Photo.objects.get().id)}]


def test_a_redraft_that_changes_nothing_still_says_why(owner, paid):
    creation = _creation(owner)
    with _model():
        jobs.execute(SCHEMA, post.start(creation).id)
    BlogPost.objects.filter(pk=creation.record_id).update(
        title="My title", excerpt="My summary.", body_html="<p>Mine.</p>", meta_description="Mine.", tags=["mine"]
    )
    creation.refresh_from_db()
    redraft = post.start(creation, instruction="try another angle")
    with _model(_draft("Another title", intro="Other words.", excerpt="Another summary.", tags=("other",))):
        jobs.execute(SCHEMA, redraft.id)
    row = _row(creation)
    assert (row.title, row.excerpt, row.body_html, row.tags) == ("My title", "My summary.", "<p>Mine.</p>", ["mine"])
    assert _fields(redraft.id) == []
    assert CopilotRun.objects.get(pk=redraft.id).result == {"fields": [], "text": ALL_KEPT}
    assert CopilotChat.objects.get(pk=creation.chat_id).entries == [{"role": "assistant", "text": ALL_KEPT}]


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

    # Out of posts by the time the worker runs: no model call, and the run says why.
    again = post.start(creation, instruction="again")
    blog_ai.BlogAiUsage.objects.filter(pk=usage.pk).update(generations_used=5)
    with _model() as model:
        jobs.execute(SCHEMA, again.id)
    model.assert_not_called()
    again.refresh_from_db()
    assert again.status == "failed" and again.result == {"reason": "quota_exhausted"}
    creation.refresh_from_db()
    assert jobs.status(creation, "post") == "failed"
    # The guide shows why (never Try again, which can only fail again).
    assert flow.state(creation)["copy"] == {"status": "failed", "run": again.id, "reason": "quota_exhausted"}


def test_kept_is_said_only_when_the_title_and_summary_are_new(owner, paid):
    creation = _creation(owner)
    with _model():
        jobs.execute(SCHEMA, post.start(creation).id)
    BlogPost.objects.filter(pk=creation.record_id).update(body_html="<p>Mine.</p>")
    creation.refresh_from_db()
    redraft = post.start(creation, instruction="a warmer title")
    with _model(_draft("Warm up your mornings", intro="Other words.")):  # the same summary as before
        jobs.execute(SCHEMA, redraft.id)
    assert [f["name"] for f in _fields(redraft.id)] == ["title"]
    # The summary is not new, so "the title and summary are new" would not be true.
    assert CopilotRun.objects.get(pk=redraft.id).result == {"fields": ["title"], "text": SOME_KEPT}


# --- the recipe through the flow (kinds/post.py) -----------------------------

HOST = "shared-test.localhost"


@pytest.fixture()
def on(settings):
    settings.FOCUS_KINDS = ["course", "post"]
    settings.FOCUS_MODE_ENABLED = True
    # No follow-up job: her taps go straight to the drafting.
    with mock.patch("apps.core.focus.flow.ai_compose.compose_available", return_value=False):
        yield


@pytest.fixture()
def hers(owner):
    from rest_framework.test import APIClient

    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=owner)
    return c


def _start(owner, topic="Breathing before class"):
    return flow.start(owner, "post", value=topic)


def _at(creation, **answers):
    FocusCreation.objects.filter(pk=creation.pk).update(answers={**creation.answers, **answers})
    creation.refresh_from_db()
    return creation


def test_her_topic_idea_is_the_drafts_title(owner, on):
    BlogTopicIdea.objects.create(title="Breathing before class", angle="Three breaths that settle a room")
    BlogTopicIdea.objects.create(title="Why stretch at your desk")
    first = flow.question("post", "topic")
    assert [o["value"] for o in first["options"]] == ["Breathing before class", "Why stretch at your desk"]
    assert first["options"][0]["hint"] == "Three breaths that settle a room"
    assert first["starter"] == "A post on " and first["can_delegate"] and first["specialist"] == "marketing"
    creation = _start(owner)
    row = BlogPost.objects.get(pk=creation.record_id)
    assert (row.title, row.status, row.source, row.created_by_id) == ("Breathing before class", "draft", "ai", owner.id)
    assert flow.state(creation)["record"] == {
        "id": row.pk,
        "kind": "post",
        "title": row.title,
        "path": f"/admin/blog/{row.pk}",
    }
    assert BlogTopicIdea.objects.get(title="Breathing before class").status == "used"  # as Write with AI's
    assert flow.current_field(creation) == "length"
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["short", "standard", "long"]


def test_you_decide_takes_her_next_topic_idea(owner, on, paid):
    BlogTopicIdea.objects.create(title="Why stretch at your desk")
    creation = flow.start(owner, "post", delegate=True)
    row = BlogPost.objects.get(pk=creation.record_id)
    assert row.title == creation.answers["topic"] == "Why stretch at your desk"
    assert flow.draft_title(creation) == row.title  # still the job's to write over
    assert BlogTopicIdea.objects.get().status == "used"


def test_you_decide_without_an_idea_goes_live_at_its_own_address(owner, on, paid):
    # No idea: the post is on a topic that fits her site, never on "New post".
    creation = flow.answer(flow.start(owner, "post", delegate=True), "length", delegate=True)
    row = BlogPost.objects.get(pk=creation.record_id)
    assert row.title == recipe.NEW_TITLE and row.slug.startswith("new-post")
    assert recipe.not_ready(row) == "Give it a title first"  # the placeholder is no title
    with _model() as model:
        jobs.execute(SCHEMA, creation.runs["post"])
    assert f"Write a blog post about: {post.ANY_TOPIC}" in model.call_args.kwargs["user"]
    assert BlogPost.objects.get(pk=creation.record_id).title == "Breathe before the day starts"
    # An idea that arrives later never changes what her post is on.
    BlogTopicIdea.objects.create(title="Why stretch at your desk")
    creation.refresh_from_db()
    creation = flow.answer(flow.answer(creation, "review", value="ok"), "cover", text="hands on a mat")  # sync runs
    assert creation.answers["topic"] == flow.DELEGATE and BlogTopicIdea.objects.get().status == "available"
    # Published at the address of its title, not of the placeholder; its announcement links there.
    creation = flow.finish(_at(creation, cover="later"), publish=True)
    row = BlogPost.objects.get(pk=creation.record_id)
    assert (row.status, row.slug) == ("published", "breathe-before-the-day-starts")
    assert recipe.announce_facts(row)["link"] == "/blog/breathe-before-the-day-starts"


def test_a_written_post_takes_its_own_address_before_any_publish(owner, on, paid, hers):
    # "You decide" with no idea: the job's title brings its address, so the page's Publish uses it too.
    creation = flow.answer(flow.start(owner, "post", delegate=True), "length", delegate=True)
    assert recipe.placeholder().fullmatch(_row(creation).slug)
    with _model():
        jobs.execute(SCHEMA, creation.runs["post"])
    row = _row(creation)
    assert (row.title, row.slug) == ("Breathe before the day starts", "breathe-before-the-day-starts")
    assert "slug" not in FocusCreation.objects.get(pk=creation.pk).drafted["post"]  # never one of her fields
    creation = flow.finish(_at(creation, review="ok", cover="later"), publish=False)
    response = hers.patch(f"/api/v1/admin/blog/posts/{row.pk}/", {"status": "published"}, format="json")
    assert response.status_code == 200
    assert (_row(creation).status, _row(creation).slug) == ("published", "breathe-before-the-day-starts")
    # An address she set herself is hers; the job leaves it.
    mine = flow.answer(flow.start(owner, "post", delegate=True), "length", delegate=True)
    BlogPost.objects.filter(pk=mine.record_id).update(slug="my-own-address")
    with _model(_draft(title="Slow breaths at night")):
        jobs.execute(SCHEMA, mine.runs["post"])
    assert (_row(mine).title, _row(mine).slug) == ("Slow breaths at night", "my-own-address")
    # Its own address is never counted as taken (unique_slug's exclude_pk).
    assert unique_slug("My own address", exclude_pk=mine.record_id) == "my-own-address"
    assert unique_slug("My own address") == "my-own-address-2"


def test_a_refused_redraft_after_the_review_is_said(owner, on, paid):
    creation = flow.answer(_start(owner), "length", value="short")
    with _model():
        jobs.execute(SCHEMA, creation.runs["post"])
    creation.refresh_from_db()
    creation = flow.answer(creation, "review", value="ok")
    assert flow.current_field(creation) == "cover"
    usage = blog_ai.tenant_usage(SCHEMA)
    blog_ai.BlogAiUsage.objects.filter(pk=usage.pk).update(generations_used=5)  # out of posts since
    with transaction.atomic(), _model() as model:  # her words at the cover step ask for a change
        creation = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        creation.pending = {"field": "cover", "text": "and make the title warmer"}
        flow.apply(creation, recipe.PostFound(change="make the title warmer"))
        creation.save()
    model.assert_not_called()
    body = flow.state(creation)
    assert body["question"]["field"] == "cover" and body["copy"]["reason"] == "quota_exhausted"
    # What she typed has its answer in the dock.
    chat = CopilotChat.objects.get(pk=creation.chat_id).entries
    assert chat[-1] == {"role": "assistant", "text": post.REFUSED["quota_exhausted"]}


def test_no_follow_up_is_asked_that_goes_nowhere(owner, on, paid):
    usage = blog_ai.tenant_usage(SCHEMA)
    with mock.patch("apps.core.focus.flow.ai_compose.compose_available", return_value=True):
        # The gate open: the writer may ask one question before the drafting.
        asked = flow.answer(_start(owner, "Why stretch at your desk"), "length", value="short")
        assert asked.brief["thinking"]["slot"] == recipe.DRAFT_SLOT and "post" not in (asked.runs or {})
        # Refused: she is told at once, never asked a question first.
        blog_ai.BlogAiUsage.objects.filter(pk=usage.pk).update(generations_used=5)
        refused = flow.answer(_start(owner), "length", value="short")
        assert not refused.brief.get("thinking")
        assert flow.state(refused)["copy"]["reason"] == "quota_exhausted"
        # After the review: no Designer's question for a photo cover (it would shape no styles).
        reviewed = flow.answer(_at(_start(owner, "Desk breaks"), length="short"), "review", value="ok")
        assert not reviewed.brief.get("thinking") and flow.current_field(reviewed) == "cover"


def test_the_post_job_is_the_reviews_drafting(owner, on, paid, hers):
    creation = flow.answer(_start(owner), "length", value="short")
    run_id = creation.runs["post"]
    run = CopilotRun.objects.get(pk=run_id)
    assert (run.specialist, run.request) == ("marketing", {"focus": creation.id, "job": "post", "instruction": ""})
    assert flow.current_field(creation) == "review" and flow.draft_started(creation)
    assert flow.state(creation)["copy"] == {"status": "building", "run": run_id}
    with _model(side_effect=core_ai.AiError("down")):
        jobs.execute(SCHEMA, run_id)
    creation.refresh_from_db()
    assert flow.state(creation)["copy"] == {"status": "failed", "run": run_id}  # a model failure: Try again
    response = hers.post(f"/api/v1/admin/focus/{creation.id}/copy/")
    assert response.status_code == 200
    retry = response.json()["copy"]
    assert retry["status"] == "building" and retry["run"] != run_id
    # A length she says at the review is kept, and her words redraft it.
    creation.refresh_from_db()
    creation.pending = {"field": "review", "text": "make it a long guide"}
    flow.apply(creation, recipe.PostFound(length="long", change="make it a long guide"))
    creation.save()
    assert creation.answers["length"] == "long"
    redraft = CopilotRun.objects.get(pk=creation.runs["post"])
    assert redraft.pk != retry["run"] and redraft.request["instruction"] == "make it a long guide"
    assert CopilotRun.objects.get(pk=retry["run"]).status == "stopped"  # it would write over the redraft
    # "Fill it in myself" stops it too.
    flow.leave(creation, abandon=True)
    assert CopilotRun.objects.get(pk=redraft.pk).status == "stopped"


def test_a_refused_blog_gate_is_said_at_once(owner, on, paid):
    usage = blog_ai.tenant_usage(SCHEMA)
    blog_ai.BlogAiUsage.objects.filter(pk=usage.pk).update(generations_used=5)  # out of posts this month
    with _model() as model:
        creation = flow.answer(_start(owner), "length", value="short")
        refused = creation.runs["post"]
        assert flow.state(creation)["copy"] == {"status": "failed", "run": refused, "reason": "quota_exhausted"}
        jobs.execute(SCHEMA, refused)  # handed nothing to do
    model.assert_not_called()
    assert CopilotRun.objects.get(pk=refused).result == {"reason": "quota_exhausted"}


def test_a_refused_blog_gate_keeps_new_post_one_click_into_the_editor(owner, on, paid, hers):
    # The writer open: New post asks her its first question.
    body = hers.get("/api/v1/admin/focus/").json()
    assert "post" in body["kinds"] and "post" in body["first"]
    kept = _start(owner)  # one she opened while it was
    usage = blog_ai.tenant_usage(SCHEMA)
    blog_ai.BlogAiUsage.objects.filter(pk=usage.pk).update(generations_used=5)  # out of posts this month
    # Refused: no questions that end in "Write it yourself"; New post is today's untitled draft.
    body = hers.get("/api/v1/admin/focus/").json()
    assert "post" not in body["kinds"] and "post" not in body["first"]
    assert body["kinds"] == ["course"] and "course" in body["first"]
    # The post she opened is still hers to continue.
    assert [c["id"] for c in body["open"]] == [kept.id]


def test_try_again_asks_the_blog_gate_first(owner, on, paid):
    usage = blog_ai.tenant_usage(SCHEMA)
    blog_ai.BlogAiUsage.objects.filter(pk=usage.pk).update(generations_used=5)  # out of posts this month
    creation = flow.answer(_start(owner), "length", value="short")
    refused, runs = creation.runs["post"], CopilotRun.objects.count()
    # Still refused: the same line, and no run started.
    creation = flow.answer(creation, "review", value="retry")
    assert creation.runs["post"] == refused and CopilotRun.objects.count() == runs
    assert flow.state(creation)["copy"] == {"status": "failed", "run": refused, "reason": "quota_exhausted"}
    # Open again (a new month, an upgrade): Try again starts the post job, which writes.
    blog_ai.BlogAiUsage.objects.filter(pk=usage.pk).update(generations_used=0)
    creation = flow.answer(creation, "review", value="retry")
    assert creation.runs["post"] != refused
    assert flow.state(creation)["copy"] == {"status": "building", "run": creation.runs["post"]}
    with _model() as model:
        jobs.execute(SCHEMA, creation.runs["post"])
    model.assert_called_once()
    assert _row(creation).title == "Breathe before the day starts"


def test_the_overview_never_waits_on_the_ai_hub(owner, on, paid, hers):
    """Every New page loads the overview: her plan and quota decide the post there, never the hub's
    health probe (2 s when the hub is slow); a hub that is down is said by the guide."""
    with mock.patch.object(core_ai, "available", side_effect=AssertionError("probed the hub")):
        body = hers.get("/api/v1/admin/focus/").json()
    assert "post" in body["kinds"]
    with mock.patch.object(blog_ai, "_provider_configured", return_value=False) as probe:
        assert blog_ai.availability(paid)["reason"] == "disabled"
    probe.assert_called_once()  # once per gate, not once per use


def test_publish_is_refused_while_the_post_is_empty(owner, on, paid):
    creation = flow.answer(_start(owner), "length", value="short")  # the post job is writing
    writing = creation.runs["post"]
    creation = _at(creation, review="ok", cover="later")
    asked = flow.state(creation)["question"]
    assert asked["field"] == "finish" and asked["question"] == recipe.NOT_READY_LINE
    assert asked["why"] == "Write something first. Until then it stays a hidden draft."
    assert [o["value"] for o in asked["options"]] == ["draft"]
    creation = flow.finish(creation, publish=True)
    assert CopilotRun.objects.get(pk=writing).status == "stopped"  # what she saw is what she finishes
    row = BlogPost.objects.get(pk=creation.record_id)
    assert (row.status, row.published_at) == ("draft", None)
    assert (creation.answers["finish"], creation.status) == ("draft", "done")
    # Her toast says why her Publish kept it a draft, and what is left once it is.
    assert flow.closing_line(creation) == "Saved as a draft. Write something first, then publish it from this page."
    BlogPost.objects.filter(pk=row.pk).update(body_html="<p>Three slow breaths.</p>")
    assert flow.closing_line(creation) == "Saved as a draft. Publish it from this page when you're ready."


def test_her_first_words_never_stay_in_the_drafts_address(owner, on):
    # A length she said goes into the title until her words are read; the address follows the title.
    words = "A post on breathing through the nose, short"
    creation = flow.start(owner, "post", text=words)
    assert _row(creation).slug == "breathing-through-the-nose-short"
    with transaction.atomic():
        creation = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        creation.pending = {"field": "topic", "text": words}
        flow.apply(creation, recipe.PostFound(topic="breathing through the nose", length="short"))
        creation.save()
    row = _row(creation)
    assert (row.title, row.slug, creation.answers["length"]) == (
        "Breathing through the nose",
        "breathing-through-the-nose",
        "short",
    )
    # An address she set herself is hers.
    BlogPost.objects.filter(pk=row.pk).update(title="Nose breathing", slug="my-own-address")
    assert recipe.retitle(row.pk, "Nose breathing", "Nose breathing for beginners")
    assert _row(creation).slug == "my-own-address"


def test_a_written_post_goes_live_and_marketing_announces_it(owner, on):
    creation = _at(_start(owner), length="short", review="ok", cover="later")
    BlogPost.objects.filter(pk=creation.record_id).update(body_html="<p>Three slow breaths.</p>")
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["publish", "draft"]
    creation = flow.finish(creation, publish=True, announce=True)
    row = BlogPost.objects.get(pk=creation.record_id)
    assert row.status == "published" and row.published_at is not None
    assert row.slug == "breathing-before-class"  # her topic's address stays
    assert flow.closing_line(creation) == recipe.CLOSING["publish"]
    assert flow.current_field(creation) == "announce"
    assert CopilotRun.objects.get(pk=creation.runs["announce"]).specialist == "marketing"
    assert recipe.announce_facts(row)["link"] == f"/blog/{row.slug}"
