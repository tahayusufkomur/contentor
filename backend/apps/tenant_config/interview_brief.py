"""The site brief the /setup interviewer fills.

Field registry (asking priority = FIELDS order), coercion of what the coach
said into stored values, what is still missing, and each field's pre-written
fallback question. Values live in ``Tenant.wizard_state["answers"]`` beside
the legacy keys every brief consumer already reads (niche, description,
goals, style, logo) — ``apply_fact`` keeps those in sync.
``answers["delegated"]`` lists fields the coach left to us ("you decide");
``answers["skipped"]`` the sections (course, event, post) they skipped.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

DELEGATE = "__delegate__"
SKIP = "__skip__"
TEXT_MAX = 500
# Answered by tapping a card (applied by code, asked in order): the look,
# the logo, and the review screens of the first course and class.
CARD_KINDS = ("style", "logo", "course", "event")
OFFERS = ("course", "live", "onsite", "articles", "community")
OFFER_GOALS = {
    "course": "sell_courses",
    "live": "run_live_classes",
    "onsite": "in_person_events",
    "articles": "write_blog",
    "community": "build_community",
}
_OFFER_WORDS = (
    ("course", r"course|program"),
    ("live", r"\blive\b|online class|zoom|stream"),
    ("onsite", r"in[- ]person|studio|on[- ]?site|retreat|workshop"),
    ("articles", r"article|blog|writ"),
    ("community", r"community|group|circle"),
)
# How students pay: any number of the paid ways, or free for now.
PAYMENTS = ("course", "membership", "event", "free")
PAID_WAYS = ("course", "membership", "event")
_PAYMENT_WORDS = (
    ("course", r"course|one[- ]time|once"),
    ("membership", r"member|subscri|monthly"),
    ("event", r"\bclass|event|session|ticket|drop[- ]in"),
    ("free", r"free"),
)
# Sections a coach can skip, and what the skip button says.
SKIP_LABELS = {"course": "No course for now", "event": "No class for now", "post": "No article for now"}
TONES = ("warm", "energetic", "calm", "expert", "playful")
# Lucide icon ids a tile may show (frontend: src/lib/option-icons.ts mirrors
# this list). The model picks one per AI-written option; fixed fields carry
# their own below. Unknown ids are dropped, never shown.
# fmt: off
ICONS = (
    "activity", "apple", "armchair", "baby", "badge-check", "badge-dollar-sign", "bed-double", "bike",
    "book-open", "brain", "briefcase", "building-2", "calendar", "calendar-days", "camera", "chef-hat",
    "circle-help", "clock", "coffee", "coins", "compass", "crown", "dumbbell", "feather",
    "flame", "flower-2", "footprints", "gem", "gift", "glasses", "globe", "graduation-cap",
    "guitar", "hand", "hand-heart", "headphones", "heart", "heart-pulse", "home", "hourglass",
    "infinity", "instagram", "languages", "laptop", "layers", "layout-grid", "leaf", "lightbulb",
    "list-checks", "lock-open", "mail", "map-pin", "megaphone", "message-circle", "mic", "moon",
    "mountain", "music", "newspaper", "paintbrush", "palette", "pen-line", "person-standing", "phone",
    "piggy-bank", "repeat", "rocket", "salad", "school", "scissors", "shield", "shirt",
    "smile", "sparkles", "sprout", "star", "stethoscope", "store", "sun", "sun-medium",
    "sunrise", "sunset", "target", "ticket", "timer", "trees", "trophy", "type",
    "user-round", "users", "users-round", "video", "wallet", "waves", "wind", "zap",
)
# fmt: on
_NICHE_WORDS = (
    ("face_yoga", r"face[- ]?yoga|facial"),
    ("pole_dance", r"\bpole\b"),
    ("belly_dance", r"belly"),
    ("makeup", r"make[- ]?up"),
    ("pilates", r"pilates"),
    ("yoga", r"yoga"),
    # Styled-site niches (2026-10-07): each maps to a site style. Specific
    # trades come before "fitness", which otherwise swallows "running".
    (
        "outdoors",
        r"\brun(ning|ner)|hik(e|ing)|\btrail|cycl|climb|surf|\bski|triathl|marathon" r"|open[- ]water|mountain|outdoor",
    ),
    (
        "cooking",
        r"cook|bak(e|ing|er)|chef|kitchen|pastry|sourdough|recipe|\bwine|barista|cuisine|nutrition|meal",
    ),
    (
        "music",
        r"music|piano|guitar|\bsing|voice|vocal|drum|\bdj\b|violin|cello|saxo|ukulele|songwrit"
        r"|produc(er|tion)|theat|acting|\bband\b",
    ),
    (
        "learning",
        r"language|spanish|english|french|german|italian|portuguese|japanese|mandarin|chinese|arabic"
        r"|tutor|\bexam|ielts|toefl|\bmath|chess|coding|programming|python|javascript|homework|study"
        r"|\bsat\b|gcse|a-level|grammar|literacy",
    ),
    (
        "creative",
        r"photograph|paint|draw|illustrat|sketch|watercolou?r|pottery|ceramic|craft|knit|\bsew|crochet"
        r"|calligraph|graphic design|\bdesign|\bfilm|video edit|animation|writing|creative|\bart\b|artist",
    ),
    (
        "wellness",
        r"sleep|stress|mindful|meditat|breathwork|anxiet|therap|mindset|life coach|spiritual|astrolog|tarot"
        r"|reiki|burnout|habit|confidence|relationship|parent|grief|hypno|wellbeing|well-being|self[- ]care",
    ),
    (
        "business",
        r"business|consult|executive|leadership|career|financ|money|invest|marketing|\bsales|entrepreneur"
        r"|startup|founder|productiv|management|negotiat|linkedin|freelanc|agency|real estate|\bceo\b",
    ),
    (
        "fitness",
        r"fitness|strength|hiit|workout|gym|personal train|running"
        r"|\bbox|kickbox|martial|\bmma\b|muay|crossfit|bootcamp|calisthenic",
    ),
)


@dataclass(frozen=True)
class Field:
    id: str
    label: str
    question: str = ""
    options: tuple[str, ...] = ()
    kind: str = "text"  # text | offers | payments | price | tone | style | logo | course | event
    needs: tuple[str, ...] = ()  # required only when one of these offers is chosen
    pays: tuple[str, ...] = ()  # ...and only when students pay in one of these ways
    group: str = ""  # the skippable section it belongs to (course | event | post)
    multi: bool = False  # several options can be ticked at once
    icons: tuple[str, ...] = ()  # one lucide id per option (fixed-option fields)
    hints: tuple[str, ...] = ()  # one short line per option, shown under it


FIELDS: tuple[Field, ...] = (
    Field(
        "teaches",
        "What they teach",
        "Let's start with you. What do you teach?",
        # The first screen, before any AI turn: 16 tiles, typing covers the rest.
        (
            "Yoga",
            "Pilates",
            "Fitness coaching",
            "Meditation",
            "Dance",
            "Belly dance",
            "Pole dance",
            "Face yoga",
            "Makeup",
            "Nutrition",
            "Life coaching",
            "Business coaching",
            "Language lessons",
            "Music lessons",
            "Art and painting",
            "Cooking",
        ),
        icons=(
            "flower-2",
            "person-standing",
            "dumbbell",
            "brain",
            "music",
            "sparkles",
            "zap",
            "smile",
            "paintbrush",
            "salad",
            "compass",
            "briefcase",
            "languages",
            "guitar",
            "palette",
            "chef-hat",
        ),
    ),
    Field(
        "audience",
        "Who they teach",
        "Who are the students you love teaching most?",
        ("Complete beginners", "Busy professionals", "People coming back after an injury", "Parents", "Older adults"),
        multi=True,
        icons=("sprout", "briefcase", "heart-pulse", "baby", "glasses"),
    ),
    Field("outcome", "What students get", "What changes for a student after working with you?", multi=True),
    Field(
        "offers",
        "How they teach",
        "How will you teach your students?",
        ("Courses", "Live online classes", "In-person sessions", "Articles", "Community"),
        kind="offers",
        multi=True,
        icons=("book-open", "video", "map-pin", "newspaper", "users"),
    ),
    Field("pitch", "One-line pitch", "If someone asked what you do, what would you say in one sentence?"),
    Field(
        "difference", "What makes their approach theirs", "What do you do differently from other teachers?", multi=True
    ),
    Field("site_style", "Site style", "Which look feels most like you?", kind="style"),
    Field("story", "Their story", "How did you come to teach this?"),
    Field(
        "credentials",
        "Training and experience",
        "Any training, certifications or years of teaching you'd like visitors to know about?",
        multi=True,
    ),
    Field(
        "tone",
        "How the site should sound",
        "How should your site sound?",
        ("Warm", "Energetic", "Calm", "Expert", "Playful"),
        kind="tone",
        multi=True,
        icons=("heart", "zap", "leaf", "graduation-cap", "smile"),
        hints=(
            "Come as you are. We'll take it slow.",
            "Let's go. Today counts.",
            "Breathe in. There's no rush here.",
            "Twelve years of teaching, distilled.",
            "Yes, you can wear socks.",
        ),
    ),
    Field("site_logo", "Logo", "Pick a logo to start with. You can change it any time.", kind="logo"),
    Field(
        "payments",
        "How students pay",
        "How will students pay you?",
        ("One-time course purchases", "Monthly membership", "Pay per class or event", "Free for now"),
        kind="payments",
        multi=True,
        icons=("book-open", "repeat", "ticket", "gift"),
        hints=(
            "Students buy each course once",
            "One monthly price for everything",
            "Students pay for each live class",
            "Everything free now, prices later",
        ),
    ),
    Field(
        "membership_price",
        "Monthly membership price",
        "What should the monthly membership cost?",
        ("9", "15", "19", "29", "39", "49", "79", "99"),
        kind="price",
        pays=("membership",),
    ),
    Field("course_topic", "First course topic", "What's your first course about?", group="course"),
    Field(
        "course_price",
        "First course price",
        "What should the course cost?",
        ("19", "29", "39", "49", "79", "99", "149", "199"),
        kind="price",
        pays=("course",),
        group="course",
    ),
    Field("course_review", "First course", "Here's your first course. Happy with it?", kind="course", group="course"),
    Field(
        "live_topic",
        "Live class topic",
        "What will your first class be about?",
        needs=("live", "onsite"),
        group="event",
    ),
    Field(
        "live_when",
        "Live class schedule",
        "When does it happen?",
        ("Weekday mornings", "Weekday lunchtimes", "Weekday evenings", "Saturday mornings", "Sunday mornings"),
        needs=("live", "onsite"),
        multi=True,
        icons=("sunrise", "coffee", "sunset", "calendar", "sun"),
        group="event",
    ),
    Field(
        "event_price",
        "Price per class",
        "What should one class cost?",
        ("5", "10", "15", "20", "25", "35", "50", "75"),
        kind="price",
        needs=("live", "onsite"),
        pays=("event",),
        group="event",
    ),
    Field(
        "event_review",
        "First class",
        "Here's your first class. Happy with it?",
        kind="event",
        needs=("live", "onsite"),
        group="event",
    ),
    Field(
        "article_topic",
        "First article topic",
        "What should your first article be about?",
        needs=("articles",),
        group="post",
    ),
    Field(
        "contact",
        "How students reach them",
        "How should students get in touch with you?",
        ("Email", "Instagram", "WhatsApp", "Phone", "Contact form"),
        multi=True,
        icons=("mail", "instagram", "message-circle", "phone", "pen-line"),
    ),
    Field(
        "location", "Where in-person sessions happen", "Where do your in-person sessions take place?", needs=("onsite",)
    ),
)
FIELD_BY_ID = {f.id: f for f in FIELDS}
# Fields that ride in `description`, or are applied as config, not as copy facts.
_NOT_FACTS = {"teaches", "pitch", "site_style", "site_logo", "course_review", "event_review"}


def _text(raw) -> str | None:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()[:TEXT_MAX]
    return text or None


def parse_offers(raw) -> list[str]:
    if isinstance(raw, list | tuple):
        raw = " ".join(map(str, raw))
    text = str(raw or "").lower()
    found = {offer for offer, pattern in _OFFER_WORDS if re.search(pattern, text)}
    return [o for o in OFFERS if o in found]


def parse_payments(raw) -> list[str]:
    if isinstance(raw, list | tuple):
        raw = " ".join(map(str, raw))
    text = str(raw or "").lower()
    found = {way for way, pattern in _PAYMENT_WORDS if re.search(pattern, text)}
    if not found and re.search(r"\bpa(y|id)", text):
        found = {"course"}
    if found & set(PAID_WAYS):
        found.discard("free")
    return [w for w in PAYMENTS if w in found]


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
    if field.kind == "payments":
        return parse_payments(raw) or None
    if field.kind == "price":
        return parse_price(raw)
    if field.kind == "tone":
        text = str(raw or "").lower()
        return ", ".join(t for t in TONES if t in text) or _text(raw)
    return _text(raw)


# Not what is taught: who it is for, and filler.
_STOP_WORDS = frozenset(
    "a an and the for with of to in on at my your our i we teach teaching lessons classes class "  # noqa: SIM905
    "beginners beginner women men kids children adults seniors people everyone busy professionals amateur "
    "advanced intermediate all levels level online".split()
)


def subject_of(answers: dict) -> str:
    """What the coach teaches as a short visual subject ("boxing", "pole
    dance") for photo search and photo matching: their own first words, or
    the niche's when they name it ("yoga"). A niche alone would search a
    boxing coach's photos as "fitness", and "general" as "coaching"."""
    niche = str(answers.get("niche") or "general").replace("_", " ")
    teaches = str(answers.get("teaches") or "").lower()
    if niche != "general" and niche in teaches:
        return niche
    words = [w for w in re.findall(r"[a-z]+", teaches) if w not in _STOP_WORDS]
    return " ".join(words[:2]) or ("" if niche == "general" else niche)


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
    if field_id == "payments":
        answers["sells"] = "paid" if set(answers["payments"]) & set(PAID_WAYS) else "free"


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


def skip(answers: dict, group: str) -> bool:
    if group not in SKIP_LABELS:
        return False
    answers["skipped"] = sorted({*(answers.get("skipped") or []), group})
    return True


def required(answers: dict) -> list[Field]:
    offers = set(answers.get("offers") or [])
    pays = set(answers.get("payments") or [])
    skipped = set(answers.get("skipped") or [])
    return [
        f
        for f in FIELDS
        if (not f.needs or offers.intersection(f.needs))
        and (not f.pays or pays.intersection(f.pays))
        and f.group not in skipped
    ]


def options_for(field: Field, answers: dict) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """A fixed field's (options, icons, hints) for this coach: paying per
    class is only offered to a coach who runs classes."""
    rows = list(
        zip(
            field.options,
            field.icons or ("",) * len(field.options),
            field.hints or ("",) * len(field.options),
            strict=False,
        )
    )
    if field.kind == "payments" and not {"live", "onsite"} & set(answers.get("offers") or []):
        rows = [r for r in rows if r[0] != "Pay per class or event"]
    options, icons, hints = (tuple(col) for col in zip(*rows, strict=True)) if rows else ((), (), ())
    return options, icons if field.icons else (), hints if field.hints else ()


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
        if field.kind in ("offers", "payments"):
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
        out["offers"] = [o for o in OFFERS if o == "course" or OFFER_GOALS[o] in goals]
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
