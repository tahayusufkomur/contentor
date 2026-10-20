"""A blog post in focus mode (stage G of
docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md). Its draft is a
BlogPost held as "draft" from her first answer (G4), so nothing is public
until her finish tap publishes it, and only with a real title and some text
(G20). The blog writer drafts it (the post job, apps.core.focus.post: her
blog quota and model). Its cover is a photo only (G7): the page prints its
own title, so a styled cover would print it twice. Marketing asks, writes and
announces it (G16); no price."""

import re

from django.db import connection
from django.utils.text import slugify

from apps.tenant_config.interview_brief import Field

from .. import analysis
from ..recipes import Recipe

NOUN = "post"
NEW_TITLE = "New post"
SETUP_TOPIC = None  # its first tiles are her topic ideas (``topic_tiles``)
COVER = "photo"
ANNOUNCER = "marketing"
# The job drafting its review (flow.draft_job), the follow-up slot before it, and what it writes.
DRAFT_JOB = "post"
DRAFT_SLOT = "draft"
DRAFT_WHAT = "title, summary and text"
REVIEWED_LINE = None
LENGTHS = ("short", "standard", "long")
FINISH = (("publish", "Publish now"), ("draft", "Keep as a draft"))
CLOSING = {
    "publish": "Published. Students can read it on your blog now.",
    # Says what it still needs while it cannot be published yet (her Publish tap kept it a draft too).
    "draft": lambda row: (
        f"Saved as a draft. {gap}, then publish it from this page."
        if row is not None and (gap := not_ready(row))
        else "Saved as a draft. Publish it from this page when you're ready."
    ),
}
NOT_READY_LINE = "Your post is saved as a draft."
# The address a draft gets from NEW_TITLE ("You decide" with no topic idea), never the one it goes live at.
PLACEHOLDER = re.compile(rf"{slugify(NEW_TITLE)}(-\d+)?")

RECIPE = Recipe(
    kind="post",
    questions=(
        Field(
            "topic",
            "Topic",
            "What's your post about?",
            ("A post on ",),
            delegable=True,  # "You decide": her next topic idea (``sync``)
            starter=True,
            why="Say the topic, who it's for and anything it must say. I'll write it for you to check.",
        ),
        Field(
            "length",
            "Length",
            "How long?",
            ("Short read", "Standard", "Long guide"),
            kind="choice",
            # What the post job asks the blog writer for (apps.core.focus.post.LENGTHS).
            hints=("About 500 words", "About 1,000 words", "About 1,400 words"),
            delegable=True,
        ),
        Field(
            "review",
            "Post",
            "Here's your post. Does it fit?",
            kind="review",
            why="Say what to change, or edit it on the page yourself.",
        ),
        Field(
            "cover",
            "Cover",
            "Pick a cover photo",
            kind="cover",
            why="Your photos first, then the library. Upload one, or tell me what you want.",
        ),
        Field(
            "finish",
            "Finish",
            "Ready. Publish it?",
            kind="finish",
            why="A draft stays hidden from students until you publish it.",
        ),
        # Only after "Publish now" with "Tell my students" ticked; answered by its own taps.
        Field("announce", "Announcement", "Tell your students?", kind="announce"),
    ),
    # G16: Marketing writes post copy and announces it; the Designer asks the cover.
    specialists={
        "topic": "marketing",
        "length": "marketing",
        "review": "marketing",
        "cover": "designer",
        "finish": "marketing",
        "announce": "marketing",
    },
    values={"length": LENGTHS},
)


class PostFound(analysis.Found):
    """What the analysis reads from her words about a post, besides what every kind shares."""

    length: str = ""  # short | standard | long


FOUND = PostFound
# Appended to the shared rules in the analysis prompt (apps.core.focus.analysis.system_for).
RULES = (
    "- topic: what the post is about, short, in her words.\n"
    "- length: 'short' (a short read), 'standard' or 'long' (a long guide) when she said how long; "
    "otherwise ''.\n"
    "- A post has no price: leave price ''.\n"
    "- unclear: a length she gave vaguely becomes one item instead of a value: its field (length), one "
    "short question, and 2-3 options, each a short label and its value ('short', 'standard' or 'long'). "
    "Leave length itself empty."
)
UNCLEAR_FIELDS = ("length",)


# ── The draft ───────────────────────────────────────────────────────────────


def _rows(pk):
    from apps.blog.models import BlogPost

    return BlogPost.objects.filter(pk=pk) if pk else BlogPost.objects.none()


def create_draft(actor, title: str, answers: dict) -> int:
    """The hidden draft, from her first answer, as the blog editor's Generate makes one."""
    from apps.blog.models import BlogPost, unique_slug

    return BlogPost.objects.create(
        title=title[:200], slug=unique_slug(title), status="draft", source="ai", created_by=actor
    ).pk


def record(pk):
    return _rows(pk).first()


def payload(row) -> dict:
    # The post page's live record key is "post:<id>" (the post job's field events).
    return {"id": row.pk, "kind": "post", "title": row.title, "path": f"/admin/blog/{row.pk}"}


def owned_by(row, user) -> bool:
    return row.created_by_id == user.id


def retitle(pk, provisional: str, title: str) -> bool:
    """Her topic's title while the draft still has the provisional one. Its
    address follows while it is still the one her first words made (a length
    she said, and all), so those words never go live in it; one she set stays."""
    from apps.blog.models import unique_slug

    row = _rows(pk).filter(title=provisional, status="draft").first()
    if row is None:
        return False
    fields = {"title": title[:200]}
    if slugify(provisional).startswith(re.sub(r"-\d+$", "", row.slug)) and slugify(title) != row.slug:
        fields["slug"] = unique_slug(title, exclude_pk=pk)
    return bool(_rows(pk).filter(title=provisional, status="draft").update(**fields))


def draft_refused() -> bool:
    """Whether the blog writer's gate (her plan, her quota) refuses a draft now: the flow then asks no
    follow-up first, which would go nowhere (flow._next_draft)."""
    from apps.blog import ai as blog_ai

    return bool(blog_ai.availability(connection.tenant)["reason"])


def start_draft(creation, instruction: str = ""):
    """The post job: the review step's title, summary, text, description and tags (apps.core.focus.post)."""
    from .. import post

    return post.start(creation, instruction=instruction)


def skips(creation) -> set[str]:
    return set()


def topic_tiles() -> list[dict]:
    """Her topic ideas (the blog's queue, as Write with AI shows them); a tap's value is the idea's title."""
    from apps.blog.models import BlogTopicIdea

    ideas = BlogTopicIdea.objects.filter(status="available")[:4]  # of the 12 a batch holds
    return [{"value": idea.title, "label": idea.title, "hint": idea.angle} for idea in ideas]


# ── Her answers ─────────────────────────────────────────────────────────────


def sync(creation) -> None:
    """After every answer: "You decide" on the topic takes her next topic idea
    (its title types in at once), until the drafting has started (an idea
    that arrives later never changes what her post is on); the idea her post
    is on leaves the queue, as Write with AI's does. Call under the
    creation's lock; the caller saves."""
    from apps.blog.models import BlogTopicIdea

    from .. import flow

    answers = creation.answers
    ideas = BlogTopicIdea.objects.filter(status="available")
    delegated = answers.get("topic") == flow.DELEGATE and not flow.draft_started(creation)
    if delegated and (idea := ideas.first()):
        answers["topic"] = idea.title
        flow._retitle(creation, NEW_TITLE, flow.working_title(idea.title, NOUN))
    if topic := answers.get("topic"):
        ideas.filter(title=topic).update(status="used")


def apply_found(creation, found) -> None:
    """Her typed answer, read: a length she said (at the review too, so a
    redraft asks for it) and the rest she said, for the writer. Call under
    the creation's lock; the caller saves."""
    if found.length in LENGTHS:
        creation.answers["length"] = found.length
    if found.notes.strip():
        brief = dict(creation.brief or {})
        brief["notes"] = " ".join(filter(None, [brief.get("notes", ""), found.notes.strip()]))
        creation.brief = brief


def apply_change(creation, found, *, field, text, item, clarified, fresh) -> None:
    """Once the post is drafted, a change she asks for redrafts it with her
    words; at the review, any words are one. Call under the creation's lock;
    the caller saves."""
    from .. import flow

    if flow.draft_started(creation) and (found.change.strip() or field == "review"):
        flow._redraft(creation, text)


def apply_clarified(creation, field, value) -> bool:
    """Her answer to a clarify question about the length; never a count."""
    if field == "length" and value in LENGTHS:
        creation.answers["length"] = value
    return False


# ── Checks, cover and going live ────────────────────────────────────────────


def not_ready(row) -> str:
    """A real title and some text (G20): the post's own rule, wherever it is
    published; its placeholder title is no title either."""
    return "Give it a title first" if row.title.strip() == NEW_TITLE else row.not_ready()


def cannot_sell(row) -> bool:
    return False


def go_live(pk) -> None:
    """Published by the blog's own rule; a draft still at its placeholder's
    address moves to its title's first, so that address never goes public.
    A published post is never moved."""
    from apps.blog.models import unique_slug
    from apps.core.copilot import content

    row = _rows(pk).filter(status="draft").first()
    if row is not None and PLACEHOLDER.fullmatch(row.slug):
        _rows(pk).update(slug=unique_slug(row.title, exclude_pk=pk))
    content.publish_blog_post(pk)


def set_photo(pk, photo_id: str) -> None:
    """ "Use this photo": the post's cover photo (apps.core.focus.covers.use_photo)."""
    _rows(pk).update(cover_photo_id=photo_id)


def cover_facts(row) -> dict:
    return {"title": row.title, "description": row.excerpt}


def announce_facts(row) -> dict:
    return {"what": NOUN, "title": row.title, "description": row.excerpt, "link": f"/blog/{row.slug}", "when": ""}


# No price, and no styled cover to file a Design under (the flow skips each step a kind lacks).
set_price = put_in_plan = cover_target = None


def suggest_price(row) -> None:
    return None


def price_tiles(creation, row) -> None:
    return None
