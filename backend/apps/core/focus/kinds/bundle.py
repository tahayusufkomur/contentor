"""A bundle in focus mode (stage F of
docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md): several things
she sells, at one price below what they cost bought apart. Its draft is an
unpublished Bundle at price 0 from her first answer (G4): students, the store
and checkout see it only once her finish tap (or the page's Publish) publishes
it, and only with two items and a price (G19). What goes in it is ticked from
what students can buy on its own (a membership's tiles, kinds/membership.py,
with a one-time price) and kept as BundleItem rows. Its price is a quarter off
the items' own prices, or their sum, or her amount: only ever her tap or her
words (F11). The site owner's alone (flow.check_owner). Finance asks, Marketing
writes and announces it (G16)."""

from decimal import Decimal

from django.db import connection

from apps.core import monetization
from apps.tenant_config.interview_brief import Field, money

from .. import analysis, pricing
from ..recipes import Recipe
from . import membership

NOUN = "bundle"
NEW_TITLE = "New bundle"
SETUP_TOPIC = None
COVER = None  # a bundle shows no image (G7)
cover_target = cover_facts = None
put_in_plan = None  # a bundle is sold on its own
ANNOUNCER = "marketing"
# The follow-up slot before the copy job drafts, and what it writes (apps.core.focus.followup).
DRAFT_SLOT = "copy"
DRAFT_WHAT = "name and description"
REVIEWED_LINE = None
FINISH = (("publish", "Publish now"), ("draft", "Keep as a draft"))
CLOSING = {
    "publish": "Published. Students can buy it in your store now.",
    # Says what it still needs while it cannot be published yet (the page's Publish waits for the same).
    "draft": lambda row: (
        f"Saved as a draft. {gap}, then publish it from this page."
        if row is not None and (gap := row.not_ready())
        else f"Saved as a draft. {monetization.NOT_SELLING} Then publish it from this page."
        if row is not None and row.cannot_sell()
        else "Saved as a draft. Publish it from this page when you're ready."
    ),
}
NOT_READY_LINE = "Your bundle is saved as a draft."
FINISH_SPECIALIST = "finance"  # what it still needs is Finance's (G16): its items and its price
TOO_FEW = "too_few_items"  # her first answer while she sells fewer than two items (the guide says so instead)
REFUSED = "A bundle holds only what students can buy."  # why one of her items could not go in
SAY = "Say an amount"  # the price step's typing box: her words set the price only when they give one
OFF = Decimal("0.75")  # the suggestion: a quarter off what the items cost bought apart

RECIPE = Recipe(
    kind="bundle",
    questions=(
        Field(
            "items",
            "Items",
            "What goes in the bundle?",
            kind="pick",  # her items she sells, as tiles (``topic_tiles``); hers to tick, never delegated
            multi=True,
            why="Tick what students get together, or name them. You can change it any time.",
        ),
        Field(
            "review",
            "Bundle",
            "Here's your bundle. Does it fit?",
            kind="review",
            why="Say what to change, or edit it on the page yourself.",
        ),
        Field(
            "access",
            "Price",
            "What should it cost?",
            kind="price",
            # Only "Just draft it" delegates it, and that leaves the price to her finish tap ("Sell it for"):
            # the bundle stays at 0, a draft (F11).
            delegable=True,
            why="Students pay it once for everything in it. You can change it any time.",
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
    # G16: Finance asks the bundle's questions and its price, Marketing writes and announces it.
    specialists={
        "items": "finance",
        "review": "marketing",
        "access": "finance",
        "finish": "finance",
        "announce": "marketing",
    },
    values={},
)


class BundleFound(analysis.Found):
    """What the analysis reads from her words about a bundle, besides what every kind shares."""

    items: list[str] = []  # the titles of her items she named as part of it, as she wrote them


FOUND = BundleFound
# Appended to the shared rules in the analysis prompt (apps.core.focus.analysis.system_for).
RULES = (
    "- topic: what the bundle is or who it is for, short, in her words; '' when she only named items.\n"
    "- items: the titles of her courses, classes and downloads she named as part of it, as she wrote "
    "them; [] when she named none. Never a title she did not name.\n"
    "- A price is what the whole bundle costs once.\n"
    "- unclear: an amount she gave vaguely ('around 10-15'), or a price in a currency other than "
    "'currency', becomes one item instead of a value: its field (price), one short question, and 2-4 "
    "options, each a short label and its value (an amount like '12'). Leave price itself empty."
)
UNCLEAR_FIELDS = ("price",)


# ── What goes in it: what students can buy on its own ───────────────────────


def _choices() -> list[dict]:
    return membership._choices(sold=True)


def topic_tiles() -> list[dict]:
    """The first question's tiles, before her first answer too: her items students can buy."""
    return _choices()


def _ticked(raw) -> list[str]:
    """Her tap's values (comma-separated; "all" is every tile), those that are
    her items students can see, in tile order: one that stopped being sold
    since she saw it is kept, to be named (``sync``)."""
    picked = {v.strip() for v in str(raw or "").split(",")}
    if "all" in picked:
        return [c["value"] for c in _choices()]
    return [c["value"] for c in membership._choices() if c["value"] in picked]


def _named(titles) -> tuple[list[str], list[str]]:
    """Her items her words named (membership._named, over what students can
    see): those that can go in, and those that cannot (free, no file yet)."""
    named = membership._named(titles, membership._choices())
    sold = {c["value"] for c in _choices()}
    return [v for v in named if v in sold], [v for v in named if v not in sold]


def _titles(values) -> list[str]:
    return [rows[0].title for v in values if (rows := membership._rows_of(v))]


def _link(value: str, pk: int, on: bool) -> None:
    """Every row a tile stands for (a series: every session) in the bundle, or out of it; never an
    in-person session that is over (no one can buy it apart)."""
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import BundleItem
    from apps.billing.serializers.bundles import is_over

    for row in membership._rows_of(value):
        key = {"bundle_id": pk, "content_type": ContentType.objects.get_for_model(row), "object_id": row.pk}
        if on:
            if not is_over(row):
                BundleItem.objects.get_or_create(**key)
        else:
            BundleItem.objects.filter(**key).delete()


# ── The draft ───────────────────────────────────────────────────────────────


def _rows(pk):
    from apps.billing.models import Bundle

    return Bundle.objects.filter(pk=pk) if pk else Bundle.objects.none()


def create_draft(actor, title: str, answers: dict) -> int:
    """The unpublished bundle at price 0, from her first answer; made here, not
    through the serializer. Named "New bundle" until her words or the copy name
    it (``flow.draft_title`` reads that as the working title). Refused while she
    sells fewer than two items: that draft could never be published (G19)."""
    from apps.billing.models import Bundle

    from ..flow import FlowError

    if len(_choices()) < 2:
        raise FlowError(TOO_FEW)
    return Bundle.objects.create(name=NEW_TITLE, price=0, is_published=False).pk


def record(pk):
    # Its items with what they are: the price tiles and checks read each one's price and state on every poll.
    return _rows(pk).prefetch_related("items__content_object").first()


def payload(row) -> dict:
    return {"id": row.pk, "kind": "bundle", "title": row.name, "path": f"/admin/store/bundles/{row.pk}"}


def owned_by(row, user) -> bool:
    """A bundle has no instructor: the site owner's (the plain form's timing stamp)."""
    return getattr(user, "role", None) == "owner"


def retitle(pk, provisional: str, title: str) -> bool:
    return bool(_rows(pk).filter(name=provisional).update(name=title[:200]))


def start_draft(creation, instruction: str = ""):
    """The copy job: the review step's name and description (apps.core.focus.copywriter)."""
    from .. import copywriter

    return copywriter.start(creation, instruction=instruction)


def skips(creation) -> set[str]:
    """What goes in it, while she sells nothing it could hold: the finish keeps
    it a draft until she does (F5)."""
    return set() if "items" in (creation.answers or {}) or _choices() else {"items"}


def ask(creation, asked: dict) -> dict:
    """What goes in it: the items her words named ticked. What her words or
    last ticks could not add leads that question, or the one after it."""
    refused = (creation.brief or {}).get("refused")
    if refused and asked["field"] in ("items", "review"):
        asked = {**asked, "why": f"{refused} {asked['why']}".strip()}
    if asked["field"] != "items":
        return asked
    values = {o["value"] for o in asked["options"]}
    return {**asked, "ticked": [v for v in (creation.brief or {}).get("items") or [] if v in values]}


def label(field, answer) -> str | None:
    """Her answered line for what goes in it: titles ("4 items" past three)."""
    if field == "items":
        values = answer if isinstance(answer, list) else _ticked(answer)
        if not values:
            return membership.NOTHING
        count = f"{len(values)} item" + ("s" if len(values) > 1 else "")
        return count if len(values) > 3 else ", ".join(_titles(values)) or count
    return None


# ── Her answers ─────────────────────────────────────────────────────────────


def apply_found(creation, found) -> None:
    """Her typed answer, read: the items she named are ticked (onto what goes
    in it when she answered it already), those that cannot go in are named,
    what it is names the draft until the copy does, and the rest is kept for
    the copy. Call under the creation's lock; the caller saves."""
    from .. import flow

    brief = dict(creation.brief or {})
    if found.notes.strip():
        brief["notes"] = " ".join(filter(None, [brief.get("notes", ""), found.notes.strip()]))
    if found.topic.strip():
        brief["topic"] = found.topic.strip()
    ticked, refused = _named(found.items) if found.items else ([], [])
    if ticked:
        brief["items"] = [*(brief.get("items") or []), *(v for v in ticked if v not in brief.get("items", []))]
        answered = creation.answers.get("items")
        if isinstance(answered, list):
            creation.answers["items"] = [*answered, *(v for v in ticked if v not in answered)]
    if refused:
        brief["refused"] = membership.refused_line(_titles(refused), [REFUSED])
    creation.brief = brief
    if found.topic.strip():  # only while it is still "New bundle"
        flow._retitle(creation, NEW_TITLE, flow.working_title(found.topic, NOUN))


def apply_change(creation, found, *, field, text, item, clarified, fresh) -> None:
    """Once the copy is drafted, a change she asks for redrafts it with her
    words; at the review, any words but a price alone are one. Her words at
    what goes in it only tick (she sees them ticked, and taps). Call under the
    creation's lock; the caller saves."""
    from .. import flow

    at_review = field == "review" and (found.answer.strip() or not analysis.price_value(found.price))
    if flow.draft_started(creation) and (found.change.strip() or at_review):
        flow._redraft(creation, text)


def apply_clarified(creation, field, value) -> bool:
    return False


def sync(creation) -> None:
    """After every answer: a tap's ticks go into the bundle, and anything she
    unticked comes out, only where this flow put it (her items on the page
    stay). An item students can no longer buy on its own is left out and named
    to her; with nothing in it, the question is asked again. A free price is no
    bundle's: her price is asked again. Call under the creation's lock; the
    caller saves."""
    answers = creation.answers
    # A tap (its values, comma-separated) says again what could not go in. Her words name theirs themselves
    # (``apply_found``), and their line stands.
    tapped = isinstance(answers.get("items"), str)
    if tapped:
        answers["items"] = _ticked(answers["items"])
    wanted = answers.get("items")
    if isinstance(wanted, list) and creation.record_id is not None:
        done = (creation.drafted or {}).get("items") or []
        if wanted != done:
            sold = {c["value"] for c in _choices()}
            kept = [v for v in wanted if v in done or v in sold]
            for v in kept:
                if v not in done:
                    _link(v, creation.record_id, on=True)
            for v in done:
                if v not in wanted:
                    _link(v, creation.record_id, on=False)
            if tapped:
                refused = [v for v in wanted if v not in kept]
                brief = {k: v for k, v in (creation.brief or {}).items() if k != "refused"}
                creation.brief = (
                    {**brief, "refused": membership.refused_line(_titles(refused), [REFUSED])} if refused else brief
                )
            creation.drafted = {**(creation.drafted or {}), "items": kept}
            wanted = kept
        if wanted:
            answers["items"] = wanted
        else:  # nothing in it: asked again
            answers.pop("items")
    if answers.get("price") in ("free", "membership"):
        answers.pop("price")
        if answers.get("access") == "free":
            answers.pop("access")


# ── The copy: the review step's name and description (G5) ───────────────────

COPY_FIELDS = ("name", "description")
# Appended to the copy job's shared prompt (apps.core.focus.copywriter.system_for).
COPY_RULES = (
    "Write a bundle name under 60 characters and a 2–4 sentence description for students: what is in it "
    "and who it is for, only from what she said and its items.\n"
    "- topic: what the bundle is, in her words; '' means pick one that fits her site and its items.\n"
    "- items: what is in it, each title with what it is; name nothing else as in it.\n"
    "- notes and followups: what else she said about it; follow it.\n"
    "- Never write a price, a discount, a saving, a number of sessions, a result or a promise she did not give."
)


def _included(row) -> list[str]:
    """What is in it, each title with what it is ("Yoga basics (course)"); a series once."""
    out: list[str] = []
    for item in row.items.select_related("content_type"):
        kind = membership.MODEL_KIND.get(item.content_type.model)
        title = kind and getattr(item.content_object, "title", "")
        if title and (entry := f"{title} ({membership.HINTS[kind].lower()})") not in out:
            out.append(entry)
    return out


def copy_facts(creation, row) -> dict:
    """What the copy job writes from: her words, what is in it, and her site."""
    from .. import outline

    brief = creation.brief or {}
    site = outline.site(connection.tenant)
    return {
        "topic": brief.get("topic", ""),
        "items": _included(row),
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
        **{key: site[key] for key in ("brand", "niche", "description")},
    }


def write_copy(pk, fields: dict) -> None:
    """Written to the model, never through the serializer, and only while it is a draft."""
    _rows(pk).filter(is_published=False).update(**fields)


# ── Price, checks and going live ────────────────────────────────────────────


def _apart(row) -> Decimal:
    """What its items cost bought apart, as the store says it: each one's own
    one-time price (a series: each session in it), drafts left out."""
    from apps.billing.serializers.bundles import listed_items, original_price

    return original_price(listed_items(row, drafts=False))


def _offers(row) -> list[pricing.Suggestion]:
    """A quarter off what its items cost bought apart, then that sum; [] with nothing priced in it."""
    total = _apart(row)
    if total <= 0:
        return []
    off = pricing.whole(total * OFF)
    full = pricing.Suggestion(total, "the same as buying them apart")
    return [pricing.Suggestion(off, f"{money(total)} bought apart; 25% off"), full] if off < total else [full]


def set_price(pk, value: str) -> None:
    """Her price: a tile's "paid:<amount>", or an amount alone (her words, or
    "Sell it for"). Never free: a bundle is paid, or a draft."""
    price = analysis.price_value(str(value).removeprefix("paid:"))
    if price not in (None, "free", "membership"):
        _rows(pk).update(price=Decimal(price))


def price_tiles(creation, row) -> dict | None:
    """A quarter off what its items cost bought apart, that sum, and "Say an
    amount" (the typing box; not a tile, so it never answers)."""
    if row is None:
        return None
    options = [{"value": f"paid:{s.amount}", "label": money(s.amount), "hint": s.reason} for s in _offers(row)]
    return {"options": options, "suggested": options[0]["value"] if options else None, "say": SAY}


def suggest_price(row) -> pricing.Suggestion | None:
    """The suggested tile's price ("Sell it for" after "Just draft it"). None
    once it has a price: one she typed on the page stands (F11)."""
    if row.price > 0:
        return None
    return next(iter(_offers(row)), None)


def not_ready(row) -> str:
    """Two items (a series once, G19), then a price: billing's rule, which the page's Publish keeps too."""
    return row.not_ready()


def cannot_sell(row) -> bool:
    """Always paid: a draft while selling is not open yet (her plan, then
    payouts). Not before it has a price: "Set its price first" comes first."""
    return row.cannot_sell()


def go_live(pk) -> None:
    _rows(pk).update(is_published=True)


# ── The announcement ────────────────────────────────────────────────────────


def announce_facts(row) -> dict:
    return {"what": NOUN, "title": row.name, "description": row.description, "link": "/store", "when": ""}
