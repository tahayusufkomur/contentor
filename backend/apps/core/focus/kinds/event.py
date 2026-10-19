"""A class or event in focus mode (stage B of
docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md): a live class,
live stream, Zoom class or in-person event. Its draft is made once she has
said which (G10: the kind never changes after) and stays a hidden draft, with
or without her date, until her finish tap (G4, G12). A weekly class is a
series (G11): finish copies the first session to the rest of her schedule,
published or held. Times are in her site's time zone (G13). Exact stays exact
(F15): her date, address, link and counts are written as she gave them.

Four models share the creation's one ``record_id``, so here it is a ref: the
row's pk and its kind's digit in one integer (``pk * 10 + digit``)."""

from datetime import date, timedelta
from decimal import Decimal
from statistics import median
from typing import Literal
from zoneinfo import ZoneInfo

from django.db import connection
from django.utils import timezone
from pydantic import BaseModel

from apps.tenant_config import interview_schedule
from apps.tenant_config.interview_brief import Field

from .. import analysis, pricing
from ..recipes import Recipe

NOUN = "class"
NEW_TITLE = "New class"
# The /setup answer that seeds the topic's starter tile: her first online class.
SETUP_TOPIC = "live_topic"
COVER = "styles"
ANNOUNCER = "community"
# The follow-up slot before the copy job drafts, and what it writes (apps.core.focus.followup).
DRAFT_SLOT = "copy"
DRAFT_WHAT = "title and description"
REVIEWED_LINE = None  # "Looks good" starts nothing more: no line after it
FINISH = (("publish", "Publish now"), ("draft", "Keep as a draft"))
CLOSING = {
    "publish": "Published. Students can find it on your site now.",
    "draft": "Saved as a draft. Publish it from this page when you're ready.",
}
NOT_READY_LINE = "Your class is saved as a draft."
WHERE = ("live", "stream", "zoom", "onsite")
LATER = "later"
ZOOM_FREE = "Zoom classes are free to join."
ZOOM_START = "https://zoom.us/j/"
PLACE_QUESTION = {"onsite": "What's the address?", "zoom": "Paste your Zoom link"}
BAD_LINK = "That doesn't look like a whole link. Paste your Zoom link?"
# Her other classes on sale, in the price step's reason.
PLURAL = {"live": "live classes", "stream": "live streams", "zoom": "Zoom classes", "onsite": "events"}
MAX_MINUTES = 24 * 60
MAX_CAPACITY = 10_000  # far under OnsiteEvent.max_capacity's PositiveIntegerField

RECIPE = Recipe(
    kind="event",
    questions=(
        Field(
            "topic",
            "Topic",
            "What's your class or event about?",
            ("A class on ",),
            delegable=True,
            starter=True,
            why=(
                "Say as much as you know: where, when, weekly or once, how long, the address, the price. "
                "I'll fill in the rest for you to check."
            ),
        ),
        Field(
            "where",
            "Where",
            "Where will it happen?",
            ("Live online", "Live stream", "On Zoom", "In person"),
            kind="choice",  # hers (not delegable): never "You decide", and "Just draft it" leaves it to her
            why="It can't change once the class is made.",
        ),
        # Hers too (not delegable): "Just draft it" leaves her date to her, never guessed.
        Field("when", "When", "When is it?", kind="schedule", why="Times are in your site's time zone."),
        Field(
            "place",
            "Place",
            "Where exactly?",
            ("Add it later",),
            why="Only students who can join see it.",
        ),
        Field(
            "review",
            "Class",
            "Here's your class. Does it fit?",
            kind="review",
            why="Say what to change, or edit it on the page yourself.",
        ),
        Field(
            "cover",
            "Cover",
            "Which cover fits your class?",
            kind="cover",
            why=(
                "Pick a style on the page. The photo row under it changes the photo in all four; "
                "upload one, or tell me what you want."
            ),
        ),
        Field(
            "access",
            "Access",
            "How will students join?",
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
    # G16: Content drafts classes, Finance asks the price, the Community manager announces them.
    specialists={
        "topic": "content",
        "where": "content",
        "when": "content",
        "place": "content",
        "review": "content",
        "cover": "designer",
        "access": "finance",
        "finish": "content",
        "announce": "community",
    },
    values={"where": WHERE, "place": (LATER,)},
)


class EventUnclear(analysis.Unclear):
    """Her words leave where, when or the price vague: only these fields, so the model's output schema says so."""

    field: Literal["where", "when", "price"]


class EventSchedule(BaseModel):
    mode: Literal["", "once", "weekly"] = ""
    date: str = ""  # once: YYYY-MM-DD
    time: str = ""  # once: HH:MM, 24-hour
    days: list[int] = []  # weekly: 0 Sunday ... 6 Saturday
    times: list[str] = []  # weekly: HH:MM, 24-hour
    start: str = ""  # weekly: the first date, YYYY-MM-DD, only when she gave one
    weeks: int | None = None  # weekly: how many weeks, only when she said


class EventFound(analysis.Found):
    """What the analysis reads from her words about a class, besides what every kind shares."""

    where: Literal["", "live", "stream", "zoom", "onsite"] = ""
    schedule: EventSchedule = EventSchedule()
    duration_minutes: int | None = None
    address: str = ""
    zoom_link: str = ""
    capacity: int | None = None
    unclear: list[EventUnclear] = []


FOUND = EventFound
# Appended to the shared rules in the analysis prompt (apps.core.focus.analysis.system_for).
RULES = (
    "- topic: what the class or event is about, short, in her words.\n"
    "- where: 'live' (a live online class), 'stream' (a live stream), 'zoom' (on Zoom) or 'onsite' (in "
    "person: her studio, a park, an address) when she said which; otherwise ''.\n"
    "- schedule: when it happens, with her exact dates and times: 'HH:MM' on a 24-hour clock, dates "
    "'YYYY-MM-DD' read against 'today'. mode 'once' with date and time; or mode 'weekly' with days "
    "(0 Sunday, 1 Monday ... 6 Saturday), times, start (the first date, only when she gave one) and "
    "weeks (how many weeks, only when she said). Leave it empty unless she gave both the day and the time.\n"
    "- duration_minutes: how long one session lasts, in minutes, when she said.\n"
    "- address: the street address of an in-person event, word for word as she wrote it.\n"
    "- zoom_link: her Zoom link, character for character as she wrote it.\n"
    "- capacity: how many people can come, when she said.\n"
    "- A price is what one session costs to join. A Zoom class is always free to join: for one on Zoom, "
    "leave price ''.\n"
    "- unclear: where, a day or time, or an amount she gave vaguely ('somewhere online', 'next week "
    "sometime', 'around 40-50'), or a price in a currency other than 'currency', becomes one item instead "
    "of a value: its field (where, when or price), one short question, and 2-4 options, each a short label "
    "and its value (live, stream, zoom or onsite; a date and time like '2026-11-03T18:00'; an amount like "
    "'45', or 'free'). Leave that field itself empty."
)
UNCLEAR_FIELDS = ("where", "when", "price")


# ── The record: four models, one ref ────────────────────────────────────────


def _split(ref) -> tuple[str | None, int | None]:
    pk, digit = divmod(int(ref), 10)
    return (WHERE[digit - 1], pk) if 1 <= digit <= len(WHERE) else (None, None)


def _ref(row) -> int:
    return row.pk * 10 + WHERE.index(_kind(row)) + 1


def _kind(row) -> str:
    from apps.media.designs import kind_of

    return kind_of(row)


def _rows(ref):
    """The draft as a one-row queryset, or None without one."""
    from apps.core.copilot import content

    kind, pk = _split(ref) if ref else (None, None)
    return content.event_model(kind).objects.filter(pk=pk) if kind else None


def _where(value) -> str | None:
    """Her kind of class from a tile's value or label (or her words naming
    one). None for anything else, "You decide" too: only she says which."""
    from .. import flow

    picked = flow._choice(RECIPE, "where", str(value or ""))
    return picked if picked in WHERE else None


def create_draft(actor, title: str, answers: dict) -> int | None:
    """The hidden, undated draft, once she has said which kind it is (G10)."""
    from apps.core.copilot import content

    kind = _where(answers.get("where"))
    if kind is None:
        return None
    made = content.create_event(actor, kind, {"title": title}, cover=False)
    return made["id"] * 10 + WHERE.index(kind) + 1


def record(ref):
    rows = _rows(ref)
    return rows.first() if rows is not None else None


def payload(row) -> dict:
    kind = _kind(row)
    return {"id": row.pk, "kind": kind, "title": row.title, "path": f"/admin/live?event={row.pk}&kind={kind}"}


def retitle(ref, provisional: str, title: str) -> bool:
    """The new title, only while the draft still has the provisional one."""
    rows = _rows(ref)
    return rows is not None and bool(rows.filter(title=provisional).update(title=title))


def start_draft(creation, instruction: str = ""):
    """The copy job: the review step's title and description (apps.core.focus.copywriter)."""
    from .. import copywriter

    return copywriter.start(creation, instruction=instruction)


def skips(creation) -> set[str]:
    """No place for a live class or stream; no price step on Zoom (it answers it, free)."""
    kind = _where((creation.answers or {}).get("where"))
    return {"place"} if kind in ("live", "stream") else {"access"} if kind == "zoom" else set()


def ask(creation, asked: dict) -> dict:
    """The place in her kind's words (the address in person, the Zoom link with
    its starter); the schedule with her time zone (G13)."""
    kind = _where((creation.answers or {}).get("where"))
    if asked["field"] == "place":
        return {
            **asked,
            "question": PLACE_QUESTION.get(kind, asked["question"]),
            "starter": ZOOM_START if kind == "zoom" else None,
        }
    if asked["field"] == "when":
        return {**asked, "timezone": _zone()}
    return asked


# ── Her answers, onto the draft ─────────────────────────────────────────────


def _zone() -> str:
    from apps.core.copilot.engine import _tenant_zone

    return _tenant_zone(connection.tenant).key


def _upcoming(schedule: dict):
    """The schedule's first session still to come, or None."""
    now = timezone.now()
    return next((d for d in interview_schedule.occurrences(schedule, _zone()) if d > now), None)


def _is_link(text: str) -> bool:
    from django.core.exceptions import ValidationError
    from django.core.validators import URLValidator

    try:
        URLValidator(schemes=["http", "https"])(text)
    except ValidationError:
        return False
    return len(text) <= 500  # ZoomClass.zoom_link


def _schedule_of(s: EventSchedule) -> dict | None:
    """Her schedule in the /setup picker's shape, checked as the picker's is
    (``interview_schedule.parse``); None while it is not whole (a day without a
    time), so its question asks. A weekly one with no first date starts today."""
    if s.mode == "once":
        return interview_schedule.parse({"mode": "once", "at": f"{s.date}T{s.time}"})
    if s.mode != "weekly":
        return None
    start = s.start or timezone.now().astimezone(ZoneInfo(_zone())).date().isoformat()
    try:
        end = (date.fromisoformat(start) + timedelta(weeks=s.weeks, days=-1)).isoformat() if s.weeks else None
    except (ValueError, OverflowError):
        return None
    raw = {"mode": "recurring", "start": start, "slots": [{"days": s.days, "times": s.times}]}
    return interview_schedule.parse({**raw, **({"end": end} if end else {})})


def apply_found(creation, found) -> None:
    """Her typed answer, read: the kind (only while there is no draft, G10),
    the schedule, the place, how long and how many, each as she gave it.
    ``sync`` writes them on the draft. Call under the creation's lock; the
    caller saves."""
    answers = creation.answers
    if found.where and creation.record_id is None:
        answers["where"] = found.where
    if (schedule := _schedule_of(found.schedule)) is not None:
        answers["when"] = schedule
    kind = _where(answers.get("where"))
    link, address = found.zoom_link.strip(), found.address.strip()
    if link and kind in (None, "zoom"):
        if _is_link(link):
            answers["place"] = link
        else:  # never junk on the page: asked once (flow.apply adds it to the clarify questions)
            option = analysis.ClarifyOption(label="Add it later", value=LATER)
            found.unclear.append(analysis.Unclear(field="place", question=BAD_LINK, options=[option]))
            found.answer = ""  # nor kept as her answer to the place question
    elif address and kind in (None, "onsite"):
        answers["place"] = address
    brief = dict(creation.brief or {})
    if found.duration_minutes and 0 < found.duration_minutes <= MAX_MINUTES:
        brief["duration_minutes"] = found.duration_minutes
    if found.capacity and 0 < found.capacity <= MAX_CAPACITY:
        brief["capacity"] = found.capacity
    if found.notes.strip():
        brief["notes"] = " ".join(filter(None, [brief.get("notes", ""), found.notes.strip()]))
    creation.brief = brief


def apply_change(creation, found, *, field, text, item, clarified, fresh) -> None:
    """Once the copy is drafted, a change she asks for redrafts it with her
    words; at the review, any words but a price alone are one. Nothing waits
    on a clarify answer: the copy holds no count. Call under the creation's
    lock; the caller saves."""
    from .. import flow

    at_review = field == "review" and (found.answer.strip() or not analysis.price_value(found.price))
    if flow.draft_started(creation) and (found.change.strip() or at_review):
        flow._redraft(creation, text)


def apply_clarified(creation, field, value) -> bool:
    """Her answer to a clarify question about where or when: a kind (only
    while there is no draft), or a date and time ('2026-11-03T18:00') or the
    picker's JSON. Anything else leaves the field to its question. Never a count."""
    if field == "where" and creation.record_id is None and (kind := _where(value)):
        creation.answers["where"] = kind
    elif field == "when":
        at = {"mode": "once", "at": str(value).strip()}
        if schedule := interview_schedule.parse(value) or interview_schedule.parse(at):
            creation.answers["when"] = schedule
    return False


def sync(creation) -> None:
    """After every answer: her words where a tile, the picker or a Zoom link
    was expected (no model read them) are asked again, never guessed; a live
    class or stream keeps no place; a Zoom class answers its price step, free
    (G9); and every answer she changed since it was last written goes on the
    draft. Written to the model, never through the serializer, so a dated
    draft stays a draft (G12). Call under the creation's lock; the caller
    saves."""
    from .. import flow

    answers = creation.answers
    if "where" in answers and creation.record_id is None and _where(answers["where"]) is None:
        answers.pop("where")
    if isinstance(answers.get("when"), str) and answers["when"] != flow.DELEGATE:
        if (schedule := interview_schedule.parse(answers["when"])) is not None:
            answers["when"] = schedule
        else:
            answers.pop("when")
    row = record(creation.record_id)
    if row is None:
        return
    kind = _kind(row)
    if kind == "zoom":
        answers["price"] = answers["access"] = "free"
    place = answers.get("place")
    if kind in ("live", "stream"):  # no place: never asked, never kept
        answers.pop("place", None)
    elif kind == "zoom" and isinstance(place, str) and place not in (LATER, flow.DELEGATE) and not _is_link(place):
        answers.pop("place")  # her words where the link was expected (no model read them): asked again
    place = answers.get("place")
    brief = creation.brief or {}
    facts = {
        "when": answers.get("when") if isinstance(answers.get("when"), dict) else None,
        "place": place if isinstance(place, str) and place not in (LATER, flow.DELEGATE) else None,
        "duration_minutes": brief.get("duration_minutes"),
        "capacity": brief.get("capacity"),
    }
    wrote = (creation.drafted or {}).get("event") or {}
    changed = {k: v for k, v in facts.items() if v is not None and wrote.get(k) != v}
    if not changed:
        return
    fields = []
    if "when" in changed:  # her first session still to come; a past one as she gave it (not_ready says so)
        dates, now = interview_schedule.occurrences(changed["when"], _zone()), timezone.now()
        row.scheduled_at = next((d for d in dates if d > now), dates[0] if dates else None)
        fields.append("scheduled_at")
    if "place" in changed and kind == "onsite":
        row.address = changed["place"]
        fields.append("address")
    if "place" in changed and kind == "zoom" and _is_link(changed["place"]):
        row.zoom_link = changed["place"]
        fields.append("zoom_link")
    if "duration_minutes" in changed:
        row.duration_minutes = changed["duration_minutes"]
        fields.append("duration_minutes")
    if "capacity" in changed and hasattr(row, "max_capacity"):
        row.max_capacity = changed["capacity"]
        fields.append("max_capacity")
    if fields:
        row.save(update_fields=fields)
    creation.drafted = {**(creation.drafted or {}), "event": {**wrote, **changed}}


# ── The copy: the review step's title and description (G5) ──────────────────

COPY_FIELDS = ("title", "description")
# Appended to the copy job's shared prompt (apps.core.focus.copywriter.system_for).
COPY_RULES = (
    "Write a class title under 60 characters and a 2–4 sentence description for students: what happens "
    "and who it is for, from what she said.\n"
    "- What to bring, or any other concrete detail (a level, a result, a benefit), only when she said it.\n"
    "- topic: what the class or event is about, in her words; '' means pick one that fits her site.\n"
    "- where: how students join. schedule, duration_minutes and capacity: hers, as she gave them; empty "
    "when she did not say.\n"
    "- notes and followups: what else she said about it; follow it.\n"
    "- Never write a date, a time, a price, an address or a link into the copy: the page shows them."
)


def copy_facts(creation, row) -> dict:
    """What the copy job writes from: her words, how and when it happens, and
    her site. Never her address or Zoom link: only students who join see
    those, and the description is public."""
    from .. import flow, outline

    answers, brief = creation.answers or {}, creation.brief or {}
    topic, when = str(answers.get("topic") or ""), answers.get("when")
    where = next(q for q in RECIPE.questions if q.id == "where").options[WHERE.index(_kind(row))]
    site = outline.site(connection.tenant)
    return {
        "topic": "" if topic == flow.DELEGATE else topic,
        "where": where,
        "schedule": interview_schedule.summary(when) if isinstance(when, dict) else "",
        "duration_minutes": brief.get("duration_minutes"),
        "capacity": brief.get("capacity"),
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
        **{key: site[key] for key in ("brand", "niche", "description")},
    }


def write_copy(ref, fields: dict) -> None:
    """The copy job's fields onto the draft, written to the model, never
    through the serializer: it stays a draft (G12)."""
    rows = _rows(ref)
    if rows is not None:
        rows.update(**fields)


# ── Price, checks and going live ────────────────────────────────────────────


def set_price(ref, value: str) -> None:
    """Her price ("free", an amount, or "paid:<amount>" from its own tiles).
    A Zoom class stays free (G9): billing cannot sell one."""
    rows = _rows(ref)
    if rows is None:
        return
    amount = None if _split(ref)[0] == "zoom" else analysis.price_value(str(value).removeprefix("paid:"))
    if amount in (None, "free", "membership"):
        rows.update(pricing_type="free", price=0)
    else:
        rows.update(pricing_type="paid", price=Decimal(amount))


def put_in_plan(ref, plan) -> None:
    """Live classes and in-person events only: the others never offer it (``price_tiles``)."""
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlanAccess

    row = record(ref)
    if row is None:
        return
    type(row).objects.filter(pk=row.pk).update(pricing_type="subscription")
    SubscriptionPlanAccess.objects.get_or_create(
        plan=plan, content_type=ContentType.objects.get_for_model(row), object_id=row.pk
    )


def price_tiles(creation, row) -> dict | None:
    """Zoom: one tile, free (G9). A live stream is never in a membership: Free
    and the suggestion. Live classes and in-person events: the shared tiles."""
    from .. import flow

    kind = _kind(row) if row is not None else _where((creation.answers or {}).get("where"))
    if kind == "zoom":
        return {"options": [{"value": "free", "label": ZOOM_FREE, "hint": ""}], "suggested": None}
    if kind != "stream" or row is None:
        return None
    s = suggest_price(row)
    paid = {
        "value": f"paid:{s.amount}",
        "label": f"One-time price: {flow._price_label(str(s.amount))}",
        "hint": s.reason,
    }
    return {"options": [{"value": "free", "label": "Free", "hint": ""}, paid], "suggested": paid["value"]}


def suggest_price(row) -> pricing.Suggestion:
    """The first rule that has her numbers: her other classes of this kind on
    sale, the class price she gave in /setup, else a starting point."""
    from apps.tenant_config.interview_brief import DELEGATE, answers_of, money, parse_price

    kind = _kind(row)
    # Published only: "sells for" is a claim, and a draft sells nothing. One price per series.
    others: dict[str, Decimal] = {}
    on_sale = type(row).objects.filter(pricing_type="paid", price__gt=0).exclude(status="draft")
    for title, price in on_sale.exclude(title=row.title).values_list("title", "price"):
        others.setdefault(title, price)
    if others:
        prices = sorted(others.values())
        low, high = prices[0], prices[-1]
        if len(others) == 1:
            reason = f"{next(iter(others))} sells for {money(low)}"
        else:
            reason = f"Your {PLURAL[kind]} sell for {money(low)}" + (f"–{money(high)}" if high != low else "")
        return pricing.Suggestion(pricing.whole(median(prices)), reason)
    given = answers_of(connection.tenant).get("onsite_price" if kind == "onsite" else "event_price")
    if given != DELEGATE and (price := parse_price(given)):
        return pricing.Suggestion(pricing.whole(Decimal(str(price))), pricing.SETUP)
    return pricing.Suggestion(Decimal(15), pricing.FALLBACK)


def _schedule(row) -> dict | None:
    """Her schedule from focus mode (the creation holding this draft), or None."""
    from apps.tenant_config.models import FocusCreation

    answers = (
        FocusCreation.objects.filter(kind="event", mode="focus", record_id=_ref(row))
        .values_list("answers", flat=True)
        .first()
    )
    when = (answers or {}).get("when")
    return when if isinstance(when, dict) else None


def not_ready(row) -> str:
    """Why it cannot go live yet, or "". A weekly class whose first session
    has passed is ready while her schedule has one to come (go_live moves it)."""
    kind = _kind(row)
    if kind == "onsite" and not row.address.strip():
        return "Add the address first"
    if kind == "zoom" and not row.zoom_link.strip():
        return "Add the Zoom link first"
    if not (row.scheduled_at and row.scheduled_at > timezone.now()):
        schedule = _schedule(row)
        if not (schedule and schedule["mode"] == "recurring" and _upcoming(schedule)):
            return "Pick a date in the future"
    return ""


def cannot_sell(row) -> bool:
    """A paid class while selling is not open yet (her plan, then payouts)."""
    from apps.core import monetization

    return row.pricing_type == "paid" and not monetization.can_monetize(connection.tenant)


def _settle_series(ref):
    """A weekly class's sessions (G11): the first moved to her schedule's first
    slot to come when its date has passed, then copied to the rest of the
    schedule, once. Returns the first session, or None."""
    from apps.live import series

    row = record(ref)
    if row is None:
        return None
    schedule = _schedule(row)
    if not schedule or schedule["mode"] != "recurring":
        return row
    if not (row.scheduled_at and row.scheduled_at > timezone.now()) and (slot := _upcoming(schedule)):
        row.scheduled_at = slot
        row.save(update_fields=["scheduled_at"])
    # ponytail: "already made" = a later session with its title exists, so a second tap or a retry never
    # copies twice; a later same-titled class made by hand counts too. Record it on the creation if that bites.
    if row.scheduled_at and not series.rows(row).filter(scheduled_at__gt=row.scheduled_at).exists():
        series.expand(row, schedule, _zone())
    return row


def go_live(ref) -> None:
    """Publish: a weekly class's sessions made first, then every held one to come."""
    from apps.live import series

    if (row := _settle_series(ref)) is not None:
        series.publish_series(row)


def keep(ref) -> None:
    """Keep as a draft: a weekly class's sessions are made too, all held (G11)."""
    _settle_series(ref)


# ── Cover and announcement ──────────────────────────────────────────────────


def cover_target(row) -> tuple[str, str]:
    """A series' cover: every session of its kind with this title wears it (E14)."""
    return (_kind(row), row.title)


def cover_facts(row) -> dict:
    return {"title": row.title, "description": row.description}


def announce_facts(row) -> dict:
    from apps.core.copilot import content

    kind = _kind(row)
    schedule = _schedule(row)
    return {
        "what": NOUN,
        "title": row.title,
        "description": row.description,
        "link": f"/calendar/{content.EVENT_KINDS[kind][3]}/{row.pk}",
        "when": interview_schedule.summary(schedule) if schedule else "",
    }
