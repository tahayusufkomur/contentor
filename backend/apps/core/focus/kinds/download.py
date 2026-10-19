"""A download in focus mode (stage D of
docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md): a workbook,
checklist, recording or template she shares. Its draft is an unpublished
DownloadFile from her first answer (F8, G4), so the file question can upload
to it; students, the store and checkout see it only once her finish tap
publishes it, and only with a file. The file question is answered by the
upload completing ("uploaded") or "Add it later", both taps; a file put on the
page's file row answers it too (``sync``). The Content Creating Specialist
drafts it, the Financial Strategist asks the price, Marketing announces it (G16)."""

from decimal import Decimal
from statistics import median

from django.db import connection
from django.template.defaultfilters import filesizeformat

from apps.tenant_config.interview_brief import Field

from .. import analysis, pricing
from ..recipes import Recipe

NOUN = "download"
NEW_TITLE = "New download"
SETUP_TOPIC = None  # /setup asks no download topic
# The first question's format tiles: each fills her answer box with its starter for her to finish (§1.3).
STARTERS = (
    ("A workbook", "A workbook on "),
    ("A checklist", "A checklist for "),
    ("A recording", "A recording of "),
    ("A template", "A template for "),
)
COVER = "styles"
ANNOUNCER = "marketing"
# The follow-up slot before the copy job drafts, and what it writes (apps.core.focus.followup).
DRAFT_SLOT = "copy"
DRAFT_WHAT = "title and description"
REVIEWED_LINE = None
UPLOADED, LATER = "uploaded", "later"
NO_FILE = "Add the file first"
FINISH = (("publish", "Publish now"), ("draft", "Keep as a draft"))
CLOSING = {
    "publish": "Published. Students can find it on your site now.",
    # Asks for the file only while it is missing.
    "draft": lambda row: (
        "Saved as a draft. Publish it from this page when you're ready."
        if row is not None and row.file_url
        else "Saved as a draft. Add the file and publish it from this page when you're ready."
    ),
}
NOT_READY_LINE = "Your download is saved as a draft."

RECIPE = Recipe(
    kind="download",
    questions=(
        Field(
            "topic",
            "Topic",
            "What are you sharing?",
            ("A ",),
            delegable=True,
            starter=True,
            why=(
                "A workbook, a checklist, a recording, a template: say what's inside, who it's for, "
                "the price. I'll fill in the rest for you to check."
            ),
        ),
        Field(
            "file",
            "File",
            "Add the file",
            ("Add it later", "File added"),
            kind="upload",  # hers (not delegable): only she has the file
            why="Drop it here or on the page. Students get it once you publish.",
        ),
        Field(
            "review",
            "Download",
            "Here's your download. Does it fit?",
            kind="review",
            why="Say what to change, or edit it on the page yourself.",
        ),
        Field(
            "cover",
            "Cover",
            "Which cover fits your download?",
            kind="cover",
            why=(
                "Pick a style on the page. The photo row under it changes the photo in all four; "
                "upload one, or tell me what you want."
            ),
        ),
        Field(
            "access",
            "Access",
            "How will students get it?",
            kind="price",
            delegable=True,
            why="You can change it any time.",
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
    # G16: Content drafts it and asks the file and finish, Finance the price, Marketing announces it.
    specialists={
        "topic": "content",
        "file": "content",
        "review": "content",
        "cover": "designer",
        "access": "finance",
        "finish": "content",
        "announce": "marketing",
    },
    # "Add it later" is the guide's one tile; "uploaded" is sent by the upload completing.
    values={"file": (LATER, UPLOADED)},
)


class DownloadFound(analysis.Found):
    """What the analysis reads from her words about a download, besides what every kind shares."""

    format: str = ""  # workbook | checklist | recording | template | guide | her own words


FOUND = DownloadFound
# Appended to the shared rules in the analysis prompt (apps.core.focus.analysis.system_for).
RULES = (
    "- topic: what she is sharing, short, in her words.\n"
    "- format: 'workbook', 'checklist', 'recording', 'template' or 'guide' when it matches; otherwise what "
    "it is, in her words; '' when she did not say.\n"
    "- A price is what the download costs once.\n"
    "- unclear: an amount she gave vaguely ('around 10-15'), or a price in a currency other than "
    "'currency', becomes one item instead of a value: its field (price), one short question, and 2-4 "
    "options, each a short label and its value (an amount like '12', or 'free'). Leave price itself empty."
)
UNCLEAR_FIELDS = ("price",)


# ── The draft ───────────────────────────────────────────────────────────────


def _rows(pk):
    from apps.downloads.models import DownloadFile

    return DownloadFile.objects.filter(pk=pk) if pk else DownloadFile.objects.none()


def create_draft(actor, title: str, answers: dict) -> int:
    """The hidden draft, from her first answer: the file question uploads to it."""
    from apps.downloads.models import DownloadFile

    return DownloadFile.objects.create(title=title[:200], is_published=False).pk


def record(pk):
    return _rows(pk).first()


def payload(row) -> dict:
    return {"id": row.pk, "kind": "download", "title": row.title, "path": f"/admin/downloads/{row.pk}"}


def retitle(pk, provisional: str, title: str) -> bool:
    return bool(_rows(pk).filter(title=provisional).update(title=title[:200]))


def start_draft(creation, instruction: str = ""):
    """The copy job: the review step's title and description (apps.core.focus.copywriter)."""
    from .. import copywriter

    return copywriter.start(creation, instruction=instruction)


def skips(creation) -> set[str]:
    return set()


def ask(creation, asked: dict) -> dict:
    """The file question's one tile is "Add it later": the upload itself sends "uploaded"."""
    if asked["field"] == "file":
        return {**asked, "options": [o for o in asked["options"] if o["value"] != UPLOADED]}
    return asked


# ── Her answers ─────────────────────────────────────────────────────────────


def apply_found(creation, found) -> None:
    """Her typed answer, read: what it is and the rest she said, for the copy.
    Call under the creation's lock; the caller saves."""
    brief = dict(creation.brief or {})
    if found.format.strip():
        brief["format"] = found.format.strip()
    if found.notes.strip():
        brief["notes"] = " ".join(filter(None, [brief.get("notes", ""), found.notes.strip()]))
    creation.brief = brief


def apply_change(creation, found, *, field, text, item, clarified, fresh) -> None:
    """Once the copy is drafted, a change she asks for redrafts it with her
    words; at the review, any words but a price alone are one. Call under the
    creation's lock; the caller saves."""
    from .. import flow

    at_review = field == "review" and (found.answer.strip() or not analysis.price_value(found.price))
    if flow.draft_started(creation) and (found.change.strip() or at_review):
        flow._redraft(creation, text)


def apply_clarified(creation, field, value) -> bool:
    return False


def sync(creation) -> None:
    """After every answer: a file on the draft answers the file question (she
    may drop it on the page at any time, F9); "uploaded" without one, or her
    words where a tap was expected, is asked again. Call under the creation's
    lock; the caller saves."""
    answers = creation.answers
    row = record(creation.record_id)
    if row is not None and row.file_url:
        answers["file"] = UPLOADED
    elif "file" in answers and answers["file"] != LATER:
        answers.pop("file")


# ── The copy: the review step's title and description (G5) ──────────────────

COPY_FIELDS = ("title", "description")
# Appended to the copy job's shared prompt (apps.core.focus.copywriter.system_for).
COPY_RULES = (
    "Write a download title under 60 characters and a 2–4 sentence description for students: what is "
    "inside and who it is for, only from what she said and the file name.\n"
    "- topic and format: what she is sharing, in her words; '' means pick one that fits her site.\n"
    "- file_name and file_size: the file she added; '' when she has not added it yet. Never claim what is "
    "inside from the file name alone beyond what it plainly says.\n"
    "- notes and followups: what else she said about it; follow it.\n"
    "- Never write a price, a page count, a result or a promise she did not give."
)


def copy_facts(creation, row) -> dict:
    """What the copy job writes from: her words, the file's name and size, and her site."""
    from .. import flow, outline

    answers, brief = creation.answers or {}, creation.brief or {}
    topic = str(answers.get("topic") or "")
    site = outline.site(connection.tenant)
    return {
        "topic": "" if topic == flow.DELEGATE else topic,
        "format": brief.get("format", ""),
        "file_name": row.file_url.rsplit("/", 1)[-1] if row.file_url else "",
        "file_size": filesizeformat(row.file_size).replace("\xa0", " ") if row.file_url else "",
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
        **{key: site[key] for key in ("brand", "niche", "description")},
    }


def write_copy(pk, fields: dict) -> None:
    """Written to the model, never through the serializer: it stays a draft."""
    _rows(pk).filter(is_published=False).update(**fields)


# ── Price, checks and going live ────────────────────────────────────────────


def set_price(pk, value: str) -> None:
    rows = _rows(pk)
    if value == "free":
        rows.update(pricing_type="free", price=0)
    else:
        rows.update(pricing_type="paid", price=Decimal(value))


def put_in_plan(pk, plan) -> None:
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlanAccess
    from apps.downloads.models import DownloadFile

    _rows(pk).update(pricing_type="subscription")
    SubscriptionPlanAccess.objects.get_or_create(
        plan=plan, content_type=ContentType.objects.get_for_model(DownloadFile), object_id=pk
    )


def price_tiles(creation, row) -> None:
    """The shared tiles: Free, the suggestion and her memberships."""
    return None


def suggest_price(row) -> pricing.Suggestion:
    """Her other downloads on sale, else a starting point."""
    from apps.downloads.models import DownloadFile
    from apps.tenant_config.interview_brief import money

    # Published only: "sells for" is a claim, and a draft sells nothing.
    others = list(
        DownloadFile.objects.filter(pricing_type="paid", price__gt=0, is_published=True)
        .exclude(file_url="")  # on sale only with its file, as the store shows it
        .exclude(pk=row.pk)
        .order_by("price")
    )
    if not others:
        return pricing.Suggestion(Decimal(9), pricing.FALLBACK)
    low, high = others[0].price, others[-1].price
    if len(others) == 1:
        reason = f"{others[0].title} sells for {money(low)}"
    else:
        reason = f"Your other downloads sell for {money(low)}" + (f"–{money(high)}" if high != low else "")
    return pricing.Suggestion(pricing.whole(median(d.price for d in others)), reason)


def not_ready(row) -> str:
    return "" if row.file_url else NO_FILE


def cannot_sell(row) -> bool:
    """A paid download while selling is not open yet (her plan, then payouts)."""
    from apps.core import monetization

    return row.pricing_type == "paid" and not monetization.can_monetize(connection.tenant)


def go_live(pk) -> None:
    _rows(pk).update(is_published=True)


# ── Cover and announcement ──────────────────────────────────────────────────


def cover_target(row) -> tuple[str, str]:
    return ("download", str(row.pk))


def cover_facts(row) -> dict:
    return {"title": row.title, "description": row.description}


def announce_facts(row) -> dict:
    return {"what": NOUN, "title": row.title, "description": row.description, "link": "/store", "when": ""}
