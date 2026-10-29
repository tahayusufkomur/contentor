"""A message to her students in focus mode (stage C of
docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md), written by the
Community manager (G16). Its draft is an Announcement held as "draft" from her
first answer: the send tasks claim only "scheduled" rows, so nothing goes out
until her Send tap (G4), and Send moves the row out of draft under its lock,
so it goes out once. Who gets it is a question with student counts (G14);
when, now, the next 10:00 or her time in her site's time zone (G15). No cover,
no price, no announcement."""

import html
import re
from datetime import datetime
from typing import Literal

from django.db import connection, transaction
from django.utils import timezone
from django.utils.formats import date_format
from django.utils.html import escape, strip_tags
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy, gettext_noop, ngettext

from apps.tenant_config import interview_schedule
from apps.tenant_config.interview_brief import Field

from .. import analysis
from ..recipes import Recipe

NOUN = "message"
NEW_TITLE = gettext_noop("New message")
SETUP_TOPIC = None
COVER = None
ANNOUNCER = None
# The follow-up slot before the copy job drafts, and what it writes (apps.core.focus.followup).
DRAFT_SLOT = "copy"
DRAFT_WHAT = "title and message"
REVIEWED_LINE = None
ALL, NOW, NEXT = "all", "now", "next"
NOT_READY_LINE = gettext_lazy("Your message is saved as a draft.")
NOBODY = gettext_lazy("Nobody would receive it yet")
# The plain composer sends a kept draft as a new message (prefilled from it), scheduled or now.
PASSED = gettext_lazy("That time has passed. Keep it as a draft and send it from Messages")
WRITING = gettext_lazy("Your message is still being written")
EMPTY = gettext_lazy("Write your message first")

RECIPE = Recipe(
    kind="message",
    questions=(
        Field(
            "topic",
            gettext_lazy("Message"),
            gettext_lazy("What do you want to tell your students?"),
            (gettext_lazy("Tell them "),),
            starter=True,  # hers (not delegable): a message comes from her
            why=gettext_lazy(
                'Say as much as you like: who it\'s for, when it goes out, a course to link, "by email too".'
            ),
        ),
        Field(
            "audience",
            gettext_lazy("Who gets it"),
            gettext_lazy("Who should get it?"),
            kind="choice",  # its tiles are her courses and bundles (``ask``)
            delegable=True,  # "You decide": all her students
            why=gettext_lazy("Only students who can see a course get its message."),
        ),
        Field(
            "review",
            gettext_lazy("Message"),
            gettext_lazy("Here's your message. Does it fit?"),
            kind="review",
            why=gettext_lazy("Say what to change, or edit it on the page yourself."),
        ),
        Field(
            "when",
            gettext_lazy("When"),
            gettext_lazy("When should it go out?"),
            (gettext_lazy("Now"), gettext_lazy("The next 10:00")),
            kind="choice",
            why=gettext_lazy("Or say a time. Times are in your site's time zone."),
        ),
        Field(
            "finish",
            gettext_lazy("Finish"),
            gettext_lazy("Ready. Send it?"),
            kind="finish",
            why=gettext_lazy("Nothing goes out until you tap Send."),
        ),
    ),
    # G16: the Community manager writes messages.
    specialists=dict.fromkeys(("topic", "audience", "review", "when", "finish"), "community"),
    values={"when": (NOW, NEXT)},
)


class MessageUnclear(analysis.Unclear):
    """Her words leave who or when vague: only these fields, so the model's output schema says so."""

    field: Literal["audience", "when"]


class MessageFound(analysis.Found):
    """What the analysis reads from her words about a message, besides what every kind shares."""

    audience: str = ""  # "all", or the course or bundle whose students she named
    when: str = ""  # "now", or her local time "YYYY-MM-DDTHH:MM"
    link_to: str = ""  # the course or class she wants it to link to
    also_email: bool = False
    unclear: list[MessageUnclear] = []


FOUND = MessageFound
# Appended to the shared rules in the analysis prompt (apps.core.focus.analysis.system_for).
RULES = (
    "- topic: what she wants to tell her students, short, in her words.\n"
    "- audience: 'all' when she said all her students; the title of the course or bundle whose students she "
    "means, as she wrote it ('my Desk Yoga students' -> 'Desk Yoga'); otherwise ''.\n"
    "- when: 'now' when she said now or right away; or 'YYYY-MM-DDTHH:MM' on a 24-hour clock, read against "
    "'today', when she gave the day and the time it goes out; otherwise ''.\n"
    "- link_to: the title of the course or session the message should link to, as she wrote it; otherwise ''.\n"
    "- also_email: true only when she said to send it by email too.\n"
    "- A message has no price: leave price ''.\n"
    "- unclear: who or when she gave vaguely ('my yoga students' with two yoga courses, 'tomorrow sometime') "
    "becomes one item instead of a value: its field (audience or when), one short question, and 2-4 options, "
    "each a short label and its value (a title, or 'all'; a time like '2026-11-03T10:00', or 'now'). Leave "
    "that field itself empty."
)
UNCLEAR_FIELDS = ("audience", "when")


# ── The draft ───────────────────────────────────────────────────────────────


def _rows(pk):
    from apps.notifications.models import Announcement

    return Announcement.objects.filter(pk=pk) if pk else Announcement.objects.none()


def create_draft(actor, title: str, answers: dict) -> int:
    from apps.core.copilot import content

    return content.create_announcement_draft(actor, {"title": title})["id"]


def record(pk):
    return _rows(pk).first()


def payload(row) -> dict:
    # The composer's live record key is "message:<id>" (copywriter: "<kind>:<id>").
    return {"id": row.pk, "kind": "message", "title": row.title, "path": f"/admin/messages/new?draft={row.pk}"}


def owned_by(row, user) -> bool:
    return row.created_by_id == user.id


def retitle(pk, provisional: str, title: str) -> bool:
    return bool(_rows(pk).filter(title=provisional, status="draft").update(title=title[:200]))


def start_draft(creation, instruction: str = ""):
    """The copy job: the review step's title and body (apps.core.focus.copywriter)."""
    from .. import copywriter

    return copywriter.start(creation, instruction=instruction)


def skips(creation) -> set[str]:
    return set()


# ── Who gets it (G14) ───────────────────────────────────────────────────────


def _target(value):
    """The published course or the active bundle on sale behind "course:<id>" / "bundle:<id>", or None."""
    from apps.billing.models import Bundle
    from apps.courses.models import Course

    kind, _sep, pk = str(value or "").partition(":")
    if not (pk.isascii() and pk.isdigit() and len(pk) < 10):
        return None
    if kind == "course":
        return Course.objects.filter(pk=pk, is_published=True).first()
    if kind == "bundle":
        return Bundle.objects.filter(pk=pk, is_active=True, is_published=True).first()
    return None


def _audience(value) -> str | None:
    """'all', 'course:<id>' or 'bundle:<id>' from a tile's value or a title she
    named; None for anything else (asked, never guessed)."""
    from apps.billing.models import Bundle
    from apps.courses.models import Course

    words = str(value or "").strip()
    if words.lower() == ALL or _target(words) is not None:
        return words.lower()
    if course := Course.objects.filter(is_published=True, title__iexact=words).first():
        return f"course:{course.pk}"
    if bundle := Bundle.objects.filter(is_active=True, is_published=True, name__iexact=words).first():
        return f"bundle:{bundle.pk}"
    return None


def _filters(value) -> dict | None:
    """Her answer as the send's filters (apps.notifications.audience); None
    when its course or bundle is gone, so it never widens to everyone."""
    from .. import flow

    if value in (None, ALL, flow.DELEGATE):
        return {}
    target = _target(value)
    return {"content_type": value.partition(":")[0], "content_id": target.pk} if target else None


def _count(filters) -> int:
    """How many students it reaches: the count the composer's preview shows."""
    from apps.notifications.audience import resolve_audience

    return 0 if filters is None else resolve_audience(filters).count()


def _students(n: int) -> str:
    return ngettext("%(n)d student", "%(n)d students", n) % {"n": n}


def _audience_tiles() -> list[dict]:
    """All her students, then each published course and active bundle on sale, with how many it reaches."""
    from apps.billing.models import Bundle
    from apps.courses.models import Course

    # ponytail: a count per tile walks her students through the paywall (resolve_audience), one course at a
    # time; fine for a coach's list, a bulk count if a big school feels it.
    tiles = [
        {"value": ALL, "label": _("All my students (%(students)s)") % {"students": _students(_count({}))}, "hint": ""}
    ]
    for kind, rows in (
        ("course", Course.objects.filter(is_published=True).order_by("title")),
        ("bundle", Bundle.objects.filter(is_active=True, is_published=True).order_by("name")),
    ):
        for row in rows:
            value = f"{kind}:{row.pk}"
            tiles.append(
                {
                    "value": value,
                    "label": _("Students of %(name)s") % {"name": _name(row)},
                    "hint": _students(_count(_filters(value))),
                }
            )
    return tiles


def _name(row) -> str:
    return getattr(row, "title", None) or row.name


# ── When (G15) ──────────────────────────────────────────────────────────────


def _zone():
    from apps.core.copilot.engine import _tenant_zone

    return _tenant_zone(connection.tenant)


def _when(value) -> str | None:
    """'now', 'next' or her local time 'YYYY-MM-DDTHH:MM' on a real day; None
    for anything else ("2026-11-31T10:00" too: asked again, never a 500)."""
    value = str(value or "").strip()
    if value in (NOW, NEXT):
        return value
    try:
        datetime.fromisoformat(value)
    except ValueError:
        return None
    return value if interview_schedule.parse({"mode": "once", "at": value}) else None


def _send_at(when, now: datetime) -> datetime | None:
    """When it goes out: now, the next 10:00 at least an hour away (reckoned at
    her tap), or her time in her site's time zone."""
    from apps.notifications.recurrence import next_send_time

    if when == NOW:
        return now
    if when == NEXT:
        return next_send_time(now, _zone())
    return datetime.fromisoformat(when).replace(tzinfo=_zone()) if _when(when) else None


def _said(at: datetime) -> str:
    at = at.astimezone(_zone())
    return _("%(weekday)s %(day)d %(month)s at %(time)s") % {
        "weekday": date_format(at, "l"),
        "day": at.day,
        "month": date_format(at, "F"),
        "time": f"{at:%H:%M}",
    }


# ── Her answers ─────────────────────────────────────────────────────────────


def _link_for(title: str) -> tuple[str, str] | None:
    """The student page of the published course, or the class or event to
    come, that she named by its title: (path, its title), or None."""
    from apps.core.copilot import content
    from apps.courses.models import Course

    title = title.strip()
    if not title:
        return None
    if course := Course.objects.filter(is_published=True, title__iexact=title).first():
        return f"/courses/{course.slug}", course.title
    for kind, names in content.EVENT_KINDS.items():
        upcoming = content.event_model(kind).objects.exclude(status="draft").filter(scheduled_at__gt=timezone.now())
        if row := upcoming.filter(title__iexact=title).order_by("scheduled_at").first():
            return f"/calendar/{names[3]}/{row.pk}", row.title
    return None


def apply_found(creation, found) -> None:
    """Her typed answer, read: who and when (each only as she gave it), the
    email tick she asked for, and the link she named, onto the draft while it
    holds no link or the one put there last (her own link is never replaced).
    Call under the creation's lock; the caller saves."""
    answers = creation.answers
    if found.audience.strip() and (audience := _audience(found.audience)):
        answers["audience"] = audience
    # A clarify question about who offers only those she can send to; with none, the tiles ask.
    for unclear in found.unclear:
        if unclear.field == "audience":
            unclear.options = [o for o in unclear.options if _audience(o.value)]
    found.unclear = [u for u in found.unclear if u.field != "audience" or u.options]
    if when := _when(found.when):
        answers["when"] = when
    brief = dict(creation.brief or {})
    if found.also_email:
        brief["also_email"] = True
    if found.notes.strip():
        brief["notes"] = " ".join(filter(None, [brief.get("notes", ""), found.notes.strip()]))
    if link := _link_for(found.link_to):
        path, title = link
        wrote = ((creation.drafted or {}).get("message") or {}).get("link", "")
        if _rows(creation.record_id).filter(status="draft", link__in={"", wrote}).update(link=path):
            creation.drafted = {**(creation.drafted or {}), "message": {"link": path}}
            brief["link_to"] = title
    creation.brief = brief


def apply_change(creation, found, *, field, text, item, clarified, fresh) -> None:
    """Once the copy is drafted, a change she asks for redrafts it with her
    words; at the review, any words but who or when alone are one. Call under
    the creation's lock; the caller saves."""
    from .. import flow

    at_review = field == "review" and (found.answer.strip() or not (found.audience or found.when))
    if flow.draft_started(creation) and (found.change.strip() or at_review):
        flow._redraft(creation, text)


def apply_clarified(creation, field, value) -> bool:
    """Her answer to a clarify question about who or when; anything else
    leaves the field to its question. Never a count."""
    if field == "audience" and (audience := _audience(value)):
        creation.answers["audience"] = audience
    elif field == "when" and (when := _when(value)):
        creation.answers["when"] = when
    return False


def sync(creation) -> None:
    """After every answer: her words where a tile was expected (no model read
    them) name a course or bundle, or are asked again, never guessed; a time
    of hers that has already passed is asked again too. Call under the
    creation's lock; the caller saves."""
    from .. import flow

    answers = creation.answers
    if answers.get("audience") not in (None, flow.DELEGATE):
        if audience := _audience(answers["audience"]):
            answers["audience"] = audience
        else:
            answers.pop("audience")
    if "when" in answers and (not _when(answers["when"]) or _passed(answers["when"])):
        answers.pop("when")


def _passed(when) -> bool:
    """A time of hers (not now, not the next 10:00) that is not still to come."""
    now = timezone.now()
    return when not in (NOW, NEXT) and (at := _send_at(when, now)) is not None and at <= now


def ask(creation, asked: dict) -> dict:
    """Who: her courses and bundles with their counts. When: the next 10:00 as
    its time. Finish: the email tick as her words left it."""
    if asked["field"] == "audience":
        return {**asked, "options": _audience_tiles()}
    if asked["field"] == "when":
        nxt = _said(_send_at(NEXT, timezone.now()))
        return {**asked, "options": [{**o, "label": nxt} if o["value"] == NEXT else o for o in asked["options"]]}
    if asked["field"] == "finish":
        return {**asked, "tick": bool((creation.brief or {}).get("also_email"))}
    return asked


def label(field, answer) -> str | None:
    """Her answered line for who ("Students of Desk Yoga") and a time ("Tuesday 20 October at 10:00")."""
    if field == "audience":
        target = _target(answer)
        return (
            _("All my students")
            if answer == ALL
            else _("Students of %(name)s") % {"name": _name(target)}
            if target
            else None
        )
    if field == "when" and answer != NOW and (at := _send_at(answer, timezone.now())):
        return _said(at)
    return None


# ── The copy: the review step's title and body (G5) ─────────────────────────

COPY_FIELDS = ("title", "body")
# Who, when and by email are the send's settings, which her words often carry ("tomorrow at 10am, also
# by email"): never content (no "you will get this by email tomorrow").
DELIVERY_RULE = (
    "- Who gets it, when it goes out and whether it also goes by email or as a notification are delivery "
    "settings the page applies, even when her words say them: never mention them in the title or the body."
)
# Appended to the copy job's shared prompt (apps.core.focus.copywriter.system_for).
COPY_RULES = (
    "Write a message title under 60 characters and a body of 1–4 short sentences, from the coach to her "
    "students, in her voice.\n"
    "- topic: what she wants to tell them, in her words. Say that; add nothing she did not say.\n"
    "- link_to: the course or session the message links to; '' when none. The page adds the link: never write "
    "a link.\n"
    "- notes and followups: what else she said about it; follow it.\n"
    + DELIVERY_RULE
    + "\n- Separate paragraphs with a blank line."
)


def copy_facts(creation, row) -> dict:
    """Her words for the copy; who, when and by email are not handed over (DELIVERY_RULE)."""
    from .. import flow, outline

    answers, brief = creation.answers or {}, creation.brief or {}
    topic = str(answers.get("topic") or "")
    site = outline.site(connection.tenant)
    return {
        "topic": "" if topic == flow.DELEGATE else topic,
        "link_to": brief.get("link_to", ""),
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
        **{key: site[key] for key in ("brand", "niche", "description")},
    }


def clean_copy(fields: dict) -> dict:
    """The model's body as the HTML the composer and the student feed render:
    any markup it wrote dropped, each paragraph escaped in a <p>, then
    sanitized, before it is emitted or kept, so both are the same safe value."""
    from apps.tenant_config.defaults import sanitize_rich_text

    text = html.unescape(strip_tags(re.sub(r"(?i)</p\s*>|<br\s*/?>", "\n\n", fields["body"])))
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    body = "".join(f"<p>{escape(p).replace(chr(10), '<br>')}</p>" for p in paragraphs)
    return {**fields, "body": sanitize_rich_text(body)}


def write_copy(pk, fields: dict) -> None:
    """Written to the model, never through the serializer: it stays a draft."""
    _rows(pk).filter(status="draft").update(**fields)


# ── Checks and sending ──────────────────────────────────────────────────────


def _creation(row):
    """The focus creation holding this draft, or None."""
    from apps.tenant_config.models import FocusCreation

    return FocusCreation.objects.filter(kind="message", mode="focus", record_id=row.pk).first()


def _answers(row) -> dict:
    creation = _creation(row)
    return (creation.answers if creation else None) or {}


def not_ready(row) -> str:
    """Why Send is refused: the copy still being written or no message yet
    (never an empty one), nobody to receive it, or her time has passed while
    she was at the finish step."""
    from .. import jobs

    creation = _creation(row)
    if creation is not None and jobs.status(creation, "copy") == "building":
        return str(WRITING)
    if not html.unescape(strip_tags(row.body)).strip():
        return str(EMPTY)
    answers = (creation.answers if creation else None) or {}
    if _count(_filters(answers.get("audience"))) == 0:
        return str(NOBODY)
    if _passed(answers.get("when")):
        return str(PASSED)
    return ""


def cannot_sell(row) -> bool:
    return False


def apply_tick(pk, ticked: bool) -> None:
    """Finish's "Also by email", before go_live or keep."""
    _rows(pk).filter(status="draft").update(also_email=bool(ticked))


def keep(pk) -> None:
    """Keep as a draft: who and when as she answered them onto the draft, so
    the plain composer opens with them. It stays a draft, which never sends
    (the dispatcher claims only "scheduled" rows); a time already passed, or
    now, is left for her to pick there, and a course or bundle gone meanwhile
    leaves who unchanged."""
    row = _rows(pk).filter(status="draft").first()
    if row is None:
        return
    answers, now = _answers(row), timezone.now()
    at = _send_at(answers.get("when"), now) if answers.get("when") else None
    fields = {"scheduled_at": at if at and at > now else None}
    if (filters := _filters(answers.get("audience"))) is not None:
        fields["filters_json"] = filters
    _rows(pk).filter(status="draft").update(**fields)


def go_live(pk) -> None:
    """Send: her audience and time onto the draft, under its lock and only
    while it is a draft, so a second tap sends nothing. Now fans out at once,
    as the composer's Send now does; a later time waits for the per-minute
    dispatcher (apps.notifications.tasks)."""
    from apps.notifications.tasks import fanout_announcement

    with transaction.atomic():
        row = _rows(pk).select_for_update().filter(status="draft").first()
        if row is None:
            return
        answers, now = _answers(row), timezone.now()
        filters, at = _filters(answers.get("audience")), _send_at(answers.get("when"), now) or now
        if filters is None:  # its course or bundle went meanwhile: never everyone instead
            return
        row.filters_json, row.status, row.scheduled_at = filters, "scheduled", at
        row.save(update_fields=["filters_json", "status", "scheduled_at"])
        if at <= now:
            schema = connection.schema_name
            transaction.on_commit(lambda: fanout_announcement.delay(row.pk, schema))


def _sent_line(row) -> str:
    if row is None or row.status == "draft":  # go_live refused it after all: its course or bundle went
        return str(KEPT)
    at = row.scheduled_at
    return _("Scheduled for %(when)s.") % {"when": _said(at)} if at and at > timezone.now() else _("Sent.")


KEPT = gettext_lazy("Saved as a draft in Messages.")
FINISH = (("send", gettext_lazy("Send")), ("draft", gettext_lazy("Keep as a draft")))
CLOSING = {"send": _sent_line, "draft": KEPT}

# No price, no cover, no announcement (the flow skips each step a kind lacks).
set_price = cover_target = cover_facts = announce_facts = None


def suggest_price(row) -> None:
    return None


def price_tiles(creation, row) -> None:
    return None
