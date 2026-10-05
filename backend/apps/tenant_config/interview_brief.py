"""The site brief the /setup interviewer fills.

Field registry (asking priority = FIELDS order), coercion of what the coach
said into stored values, what is still missing, and each field's pre-written
fallback question. Values live in ``Tenant.wizard_state["answers"]`` beside
the legacy keys every brief consumer already reads (niche, description,
goals, style, logo) — ``apply_fact`` keeps those in sync.
``answers["delegated"]`` lists fields the coach left to us ("you decide").
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

DELEGATE = "__delegate__"
TEXT_MAX = 500
CARD_KINDS = ("style", "logo")
OFFERS = ("course", "live", "onsite", "articles", "community", "memberships")
OFFER_GOALS = {
    "course": "sell_courses",
    "live": "run_live_classes",
    "onsite": "in_person_events",
    "articles": "write_blog",
    "community": "build_community",
    "memberships": "sell_courses",
}
_OFFER_WORDS = (
    ("course", r"course|program"),
    ("live", r"\blive\b|online class|zoom|stream"),
    ("onsite", r"in[- ]person|studio|on[- ]?site|retreat|workshop"),
    ("articles", r"article|blog|writ"),
    ("community", r"community|group|circle"),
    ("memberships", r"member|subscription"),
)
TONES = ("warm", "energetic", "calm", "expert", "playful")
_NICHE_WORDS = (
    ("face_yoga", r"face[- ]?yoga|facial"),
    ("pole_dance", r"\bpole\b"),
    ("belly_dance", r"belly"),
    ("makeup", r"make[- ]?up"),
    ("pilates", r"pilates"),
    ("yoga", r"yoga"),
    ("fitness", r"fitness|strength|hiit|workout|gym|personal train|running"),
)


@dataclass(frozen=True)
class Field:
    id: str
    label: str
    question: str = ""
    options: tuple[str, ...] = ()
    kind: str = "text"  # text | offers | sells | price | tone | style | logo
    needs: tuple[str, ...] = ()  # required only when one of these offers is chosen
    paid_only: bool = False  # ...and only when the coach sells


FIELDS: tuple[Field, ...] = (
    Field(
        "teaches",
        "What they teach",
        "Let's start with you. What do you teach?",
        ("Yoga", "Pilates", "Fitness coaching", "Something else"),
    ),
    Field(
        "audience",
        "Who they teach",
        "Who are the students you love teaching most?",
        ("Complete beginners", "Busy professionals", "People coming back after an injury"),
    ),
    Field("outcome", "What students get", "What changes for a student after working with you?"),
    Field(
        "offers",
        "What they offer",
        "Besides your first course, what else would you like to offer?",
        ("Just courses for now", "Live online classes", "In-person sessions", "Articles"),
        kind="offers",
    ),
    Field("pitch", "One-line pitch", "If someone asked what you do, what would you say in one sentence?"),
    Field("difference", "What makes their approach theirs", "What do you do differently from other teachers?"),
    Field("site_style", "Site style", "Which look feels most like you?", kind="style"),
    Field("story", "Their story", "How did you come to teach this?"),
    Field(
        "credentials",
        "Training and experience",
        "Any training, certifications or years of teaching you'd like visitors to know about?",
        ("I'd rather not mention any",),
    ),
    Field(
        "tone",
        "How the site should sound",
        "How should your site sound?",
        ("Warm", "Energetic", "Calm", "Expert"),
        kind="tone",
    ),
    Field("site_logo", "Logo", "Pick a logo to start with. You can change it any time.", kind="logo"),
    Field("course_topic", "First course topic", "What's your first course about?"),
    Field(
        "course_format",
        "First course format",
        "How is it structured?",
        ("4 weeks, one lesson a week", "A weekend intensive", "Self-paced lessons"),
    ),
    Field("course_level", "First course level", "Who is this course for?", ("Beginners", "Intermediate", "All levels")),
    Field(
        "sells",
        "Free or paid",
        "Will students pay, or is everything free to start?",
        ("Students pay", "Free to start"),
        kind="sells",
    ),
    Field(
        "course_price",
        "First course price",
        "What should the course cost?",
        ("29", "49", "99"),
        kind="price",
        paid_only=True,
    ),
    Field("live_topic", "Live class topic", "What will your live class be about?", needs=("live", "onsite")),
    Field(
        "live_when",
        "Live class schedule",
        "When does it happen?",
        ("Weekday evenings", "Saturday mornings", "Sunday mornings"),
        needs=("live", "onsite"),
    ),
    Field("article_topic", "First article topic", "What should your first article be about?", needs=("articles",)),
    Field(
        "contact",
        "How students reach them",
        "How should students get in touch with you?",
        ("Email", "Instagram", "WhatsApp"),
    ),
    Field(
        "location", "Where in-person sessions happen", "Where do your in-person sessions take place?", needs=("onsite",)
    ),
)
FIELD_BY_ID = {f.id: f for f in FIELDS}
# Fields that ride in `description`, or are applied as config, not as copy facts.
_NOT_FACTS = {"teaches", "pitch", "site_style", "site_logo"}


def _text(raw) -> str | None:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()[:TEXT_MAX]
    return text or None


def parse_offers(raw) -> list[str]:
    if isinstance(raw, list | tuple):
        raw = " ".join(map(str, raw))
    text = str(raw or "").lower()
    found = {offer for offer, pattern in _OFFER_WORDS if re.search(pattern, text)}
    return [o for o in OFFERS if o in found]


def parse_price(raw) -> float | None:
    text = str(raw or "").lower()
    if "free" in text:
        return 0.0
    match = re.search(r"\d+(?:[.,]\d{1,2})?", text)
    return min(float(match.group().replace(",", ".")), 9999.0) if match else None


def coerce(field_id: str, raw):
    """What the coach said → the stored value, or None when it doesn't fit."""
    field = FIELD_BY_ID.get(field_id)
    if field is None or field.kind in CARD_KINDS:  # cards go through choose()
        return None
    if field.kind == "offers":
        return parse_offers(raw) or None
    if field.kind == "sells":
        text = str(raw or "").lower().strip()
        if not text:
            return None
        return "free" if "free" in text and "pay" not in text else "paid"
    if field.kind == "price":
        return parse_price(raw)
    if field.kind == "tone":
        text = str(raw or "").lower()
        return next((t for t in TONES if t in text), None) or _text(raw)
    return _text(raw)


def niche_for(text) -> str:
    lowered = str(text or "").lower()
    return next((niche for niche, pattern in _NICHE_WORDS if re.search(pattern, lowered)), "general")


def _sync_legacy(answers: dict, field_id: str) -> None:
    """Keep the keys existing consumers read (CoachBrief, the composer,
    setup_items goals) in step with the brief."""
    if field_id == "teaches":
        answers["niche"] = niche_for(answers["teaches"])
    if field_id in ("teaches", "pitch"):
        answers["description"] = str(answers.get("pitch") or answers.get("teaches") or "")[:TEXT_MAX]
    if field_id == "offers":
        offers = ["course", *[o for o in answers["offers"] if o != "course"]]
        answers["offers"] = [o for o in OFFERS if o in offers]
        answers["goals"] = sorted({OFFER_GOALS[o] for o in answers["offers"]})


def apply_fact(answers: dict, field_id: str, raw) -> bool:
    value = coerce(field_id, raw)
    if value is None:
        return False
    answers[field_id] = value
    answers["delegated"] = [d for d in answers.get("delegated") or [] if d != field_id]
    _sync_legacy(answers, field_id)
    return True


def delegate(answers: dict, field_id: str) -> bool:
    if field_id not in FIELD_BY_ID:
        return False
    delegated = list(answers.get("delegated") or [])
    if field_id not in delegated:
        delegated.append(field_id)
    answers["delegated"] = delegated
    return True


def required(answers: dict) -> list[Field]:
    offers = set(answers.get("offers") or [])
    paid = answers.get("sells") == "paid"
    return [f for f in FIELDS if (not f.needs or offers.intersection(f.needs)) and (not f.paid_only or paid)]


def is_settled(answers: dict, field_id: str) -> bool:
    if field_id in (answers.get("delegated") or []):
        return True
    return answers.get(field_id) not in (None, "", [])


def missing(answers: dict) -> list[Field]:
    return [f for f in required(answers) if not is_settled(answers, f.id)]


def settled(answers: dict, ids) -> bool:
    """Every one of ``ids`` that is currently required is answered or delegated."""
    needed = {f.id for f in required(answers)}
    return all(is_settled(answers, i) for i in ids if i in needed)


def composer_facts(answers: dict) -> list[dict]:
    """Answered fields as labelled {q, a} facts for the composer, copilot and drafts."""
    out = []
    for field in FIELDS:
        value = answers.get(field.id)
        if field.id in _NOT_FACTS or value in (None, "", []):
            continue
        if field.kind == "offers":
            value = ", ".join(value)
        elif field.kind == "price":
            value = "free" if value == 0 else f"{value:g}"
        out.append({"q": field.label, "a": str(value)[:TEXT_MAX]})
    return out


def migrate_legacy(answers: dict) -> dict:
    """Pre-fill the brief of a tenant that signed up through the old wizard.
    Only fills keys that are absent, so it is safe to apply on every read."""
    out = dict(answers)
    niche = out.get("niche")
    if "teaches" not in out and niche and niche != "general":
        out["teaches"] = niche.replace("_", " ")
    if "pitch" not in out and out.get("description"):
        out["pitch"] = str(out["description"])[:TEXT_MAX]
    goals = set(out.get("goals") or [])
    if "offers" not in out and goals:
        out["offers"] = [o for o in OFFERS if o == "course" or OFFER_GOALS[o] in goals and o != "memberships"]
    if "site_style" not in out and out.get("style"):
        out["site_style"] = out["style"]
    logo = out.get("logo") or {}
    if "site_logo" not in out and logo.get("mode"):
        out["site_logo"] = str(logo.get("curated_id")) if logo.get("mode") == "curated" else "wordmark"
    return out


def answers_of(tenant) -> dict:
    state = tenant.wizard_state or {}
    answers = dict(state.get("answers") or {})
    return answers if state.get("flow") == "interview" else migrate_legacy(answers)


_GONE = object()


def save_answers(tenant, answers: dict, base: dict | None = None) -> None:
    """Locked write of wizard_state["answers"]; the composer writes site_plan
    into the same JSON from Celery, so other keys are re-read under the lock.

    With ``base`` (the answers as read before this change), only the keys
    this caller changed are applied onto the freshly locked answers, so two
    tabs answering at once never wipe each other's facts."""
    from apps.core.models import Tenant

    with transaction.atomic():
        state = dict(Tenant.objects.select_for_update().get(pk=tenant.pk).wizard_state or {})
        if base is not None:
            merged = dict(state.get("answers") or {})
            for key in set(base) | set(answers):
                value = answers.get(key, _GONE)
                if value == base.get(key, _GONE):
                    continue
                if value is _GONE:
                    merged.pop(key, None)
                else:
                    merged[key] = value
            answers = merged
        state["answers"] = answers
        state["interview_last_at"] = timezone.now().isoformat()
        Tenant.objects.filter(pk=tenant.pk).update(wizard_state=state)
    tenant.wizard_state = state


TOUCH_EVERY_SECONDS = 600


def touch(tenant) -> None:
    """Record setup activity (opening /setup, go-live, handoff) so the
    abandoned-signup cleanup never mistakes a working coach for an idle one.
    Coarse on purpose: at most one write per 10 minutes per tenant."""
    from datetime import datetime

    from apps.core.models import Tenant

    state = tenant.wizard_state or {}
    if state.get("flow") != "interview":
        return
    last = state.get("interview_last_at")
    try:
        fresh = last and (timezone.now() - datetime.fromisoformat(last)).total_seconds() < TOUCH_EVERY_SECONDS
    except (TypeError, ValueError):
        fresh = False
    if fresh:
        return
    with transaction.atomic():
        state = dict(Tenant.objects.select_for_update().get(pk=tenant.pk).wizard_state or {})
        state["interview_last_at"] = timezone.now().isoformat()
        Tenant.objects.filter(pk=tenant.pk).update(wizard_state=state)
    tenant.wizard_state = state
