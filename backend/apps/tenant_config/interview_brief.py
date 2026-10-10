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
# the logo, the calendar layout, and the review screens of the first course and class.
CARD_KINDS = ("style", "logo", "calendar", "course", "event")
# Fixed answer lists the coach's words are parsed against; the model phrases
# the question to fit them and never rewrites them.
FIXED_KINDS = (
    "offers",
    "payments",
    "memberships",
    "schedule",
    "specialty",
    "calendar_nav",
    "socials",
    "price",
    "contact",
)
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
# One line under each tone answer (Warm, Energetic, Calm, Expert, Playful). The
# model writes the coach's own (answers["tone_hints"]); these are the fallback,
# per broad tile ("" = any other), so no niche gets another niche's words.
TONE_HINTS = {
    "": (
        "Come as you are. We'll take it slow.",
        "Let's go. Today counts.",
        "Breathe in. There's no rush here.",
        "Years of experience, shared plainly.",
        "Let's have some fun with this.",
    ),
    "Yoga": (
        "Come as you are. Your mat is a safe place.",
        "Move, breathe and feel the heat rise.",
        "Slow breath, steady body, quiet mind.",
        "Years of practice, taught with clear cues.",
        "Let's find your flow, one silly pose at a time.",
    ),
    "Pilates": (
        "Strong core, kind pace, every body welcome.",
        "Sculpt, lengthen and feel the burn.",
        "Controlled movement, long lines, calm breath.",
        "Precise form, taught the way it's built.",
        "Tiny moves, big results. Let's have fun with it.",
    ),
    "Fitness coaching": (
        "Strength for real life, at your own pace.",
        "Let's go. Today's session counts.",
        "Steady progress, no crash, no burnout.",
        "Programmes built on what actually works.",
        "Sweat, laugh, repeat. Your new favourite hour.",
    ),
    "Dance": (
        "Dance like nobody's judging. Nobody is.",
        "Turn up the music and move.",
        "Gentle rhythm, easy steps, no pressure.",
        "Years on the floor, taught step by step.",
        "Shake it out. Spins and smiles welcome.",
    ),
    "Meditation": (
        "Rest here. There's nothing to fix.",
        "Reset your mind in ten minutes flat.",
        "Breathe in. The room goes quiet.",
        "Practices rooted in years of teaching.",
        "Your brain needs a nap. Let's give it one.",
    ),
    "Nutrition": (
        "Good food, no guilt, no strict rules.",
        "Fuel up with simple, delicious meals.",
        "Eat well, sleep well, feel steady.",
        "Evidence-based plans, explained plainly.",
        "Real food that tastes like a treat.",
    ),
    "Life coaching": (
        "You've got this. Let's find the next step.",
        "Stop waiting. Start the change today.",
        "Clear thinking, one honest question at a time.",
        "Proven tools for the big decisions.",
        "Dream big, then let's make it happen.",
    ),
    "Business coaching": (
        "Your business, built with people you trust.",
        "Grow faster and stop the guesswork.",
        "Clear plans, steady decisions, no panic.",
        "Strategy from years in the trenches.",
        "Serious results, and a bit of fun along the way.",
    ),
}
# The memberships a coach can offer, any number of them, each built on what
# they teach with: id, label, monthly price, the offers it needs, whether the
# first course is in it, its perks and a line about it.
MEMBERSHIP_TIERS = (
    {
        "id": "digital",
        "label": "Digital membership",
        "price": 9,
        "needs": ("course",),
        "courses": True,
        "icon": "laptop",
        "perks": ("Every digital course", "New courses as they land"),
        "blurb": "All the pre-recorded content, watched any time.",
    },
    {
        "id": "online",
        "label": "Online membership",
        "price": 19,
        "needs": ("live",),
        "courses": True,
        "icon": "video",
        "perks": ("All live online classes", "Class replays", "Every digital course"),
        "blurb": "Every live class from home, plus the courses.",
    },
    {
        "id": "studio",
        "label": "Studio membership",
        "price": 49,
        "needs": ("onsite",),
        "courses": True,
        "icon": "building-2",
        "perks": ("Unlimited in-person sessions", "Every digital course"),
        "blurb": "Train at your place as often as they like.",
    },
    {
        "id": "community",
        "label": "Community membership",
        "price": 5,
        "needs": ("community",),
        "courses": False,
        "icon": "users",
        "perks": ("The members' community", "Members-only articles"),
        "blurb": "A place to talk, share and stay motivated.",
    },
    {
        "id": "all",
        "label": "All-access",
        "price": 69,
        "needs": (),
        "courses": True,
        "icon": "crown",
        "perks": ("Everything, online and in person",),
        "blurb": "One membership for all of it.",
    },
)
TIER_BY_ID = {t["id"]: t for t in MEMBERSHIP_TIERS}


def tiers_for(answers: dict) -> list[dict]:
    """The tiers this coach's offers allow; all-access only when there is
    more than one thing to bundle."""
    have = set(answers.get("offers") or ["course"])
    return [t for t in MEMBERSHIP_TIERS if set(t["needs"]) <= have and (t["needs"] or len(have) > 1)]


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
    # Styled-site niches (2026-10-07, 2026-10-08): each maps to a site style.
    # Specific trades come before "fitness", which otherwise swallows
    # "running" and "boxing"; the narrow ones (tech, crafts, writing…) come
    # before the broad "learning"/"creative"/"wellness".
    (
        "outdoors",
        r"\brun(ning|ner)|hik(e|ing)|\btrail|cycl|climb|surf|\bski(ing|er|s)?\b|triathl|marathon"
        r"|open[- ]water|mountain|outdoor",
    ),
    (
        "martial_arts",
        r"martial|karate|judo|taekwondo|jiu[- ]?jitsu|\bbjj\b|aikido|kung[- ]?fu|krav|self[- ]defen[cs]e|fencing"
        r"|kendo",
    ),
    (
        "dance",
        r"danc|ballet|hip[- ]?hop|zumba|salsa|bachata|tango|choreo|ballroom|flamenco|breakdanc|\bk-?pop",
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
        "tech",
        r"coding|programming|python|javascript|software|developer|web dev|data (science|analy)|machine learning"
        r"|\bai\b|cyber|no[- ]?code|\bexcel\b|\bsql\b|\bux\b|devops|\bcloud\b",
    ),
    (
        "family",
        r"parent|\bmum|\bmom|baby|babies|toddler|child(ren|care)|pregnan|postnatal|doula|montessori"
        r"|newborn|breastfe|early years",
    ),
    (
        "spiritual",
        r"spiritual|astrolog|tarot|reiki|psychic|numerolog|crystal|manifest|oracle|human design|shaman|chakra"
        r"|energy heal|\bwitch",
    ),
    (
        "beauty",
        r"skin[- ]?care|\bskin\b|\bhair|\bnail|beauty|cosmetic|\blash|\bbrow|esthetic|aesthetic|gua sha"
        r"|fashion|styling|wardrobe|barber|colou?r analysis",
    ),
    (
        "crafts",
        r"pottery|ceramic|craft|knit|\bsew|crochet|embroider|weav|woodwork|carpentry|macram|candle|soap"
        r"|\bdiy\b|upholster|jewel|leather|origami",
    ),
    (
        "writing",
        r"writing|writer|author|novel|poetry|\bpoem|storytell|copywrit|journalis|memoir|screenwrit|publishing"
        r"|blogging|creative writing|literature|\bessay",
    ),
    (
        "learning",
        r"language|spanish|english|french|german|italian|portuguese|japanese|mandarin|chinese|arabic"
        r"|tutor|\bexam|ielts|toefl|\bmath|chess|homework|study"
        r"|\bsat\b|gcse|a-level|grammar|literacy",
    ),
    (
        "creative",
        r"photograph|paint|draw|illustrat|sketch|watercolou?r|calligraph|graphic design|\bdesign|\bfilm"
        r"|video edit|animation|creative|\bart\b|artist",
    ),
    (
        "wellness",
        r"sleep|stress|mindful|meditat|breathwork|anxiet|therap|mindset|life coach|burnout|habit|confidence"
        r"|relationship|grief|hypno|wellbeing|well-being|self[- ]care",
    ),
    (
        "business",
        r"business|consult|executive|leadership|career|financ|money|invest|marketing|\bsales|entrepreneur"
        r"|startup|founder|productiv|management|negotiat|linkedin|freelanc|agency|real estate|\bceo\b",
    ),
    (
        "fitness",
        r"fitness|strength|hiit|workout|gym|personal train|running|crossfit|bootcamp|calisthenic"
        r"|\bbox|kickbox|\bmma\b|muay|wrestl",
    ),
)


# Each broad first-screen tile → the kinds of it a coach can pick next
# ("Dance" → belly dance, hip hop…), and the words in a studio name that give
# the tile away ("Bella Belly Dance" opens on the kinds of dance). Labels are
# unique across tiles: a pick of them alone tells which tile it belongs to.
SPECIALTIES = {
    "Yoga": (
        r"yoga",
        (
            "Vinyasa yoga",
            "Hatha yoga",
            "Yin yoga",
            "Ashtanga yoga",
            "Kundalini yoga",
            "Prenatal yoga",
            "Face yoga",
            "Power yoga",
        ),
    ),
    "Pilates": (
        r"pilates|reformer|barre",
        ("Mat pilates", "Reformer pilates", "Clinical pilates", "Prenatal pilates", "Wall pilates", "Barre"),
    ),
    "Fitness coaching": (
        r"fitness|\bfit\b|\bgym|strength|\bbox|crossfit|\bhiit|bootcamp|personal train",
        (
            "Strength training",
            "HIIT",
            "Running",
            "Boxing",
            "Weight loss training",
            "Calisthenics",
            "Mobility",
            "Pre & postnatal fitness",
        ),
    ),
    "Dance": (
        r"danc|ballet|salsa|bachata|tango|belly|hip[- ]?hop|zumba|\bpole\b",
        (
            "Belly dance",
            "Hip hop",
            "Salsa & bachata",
            "Ballet",
            "Contemporary",
            "Pole dance",
            "Latin & ballroom",
            "Zumba",
        ),
    ),
    "Meditation": (
        r"meditat|mindful|breath",
        ("Mindfulness", "Breathwork", "Guided meditation", "Sound healing", "Yoga nidra", "Sleep & relaxation"),
    ),
    "Nutrition": (
        r"nutri|diet|\bmeal|\bfood",
        (
            "Healthy weight loss",
            "Sports nutrition",
            "Plant-based eating",
            "Gut health",
            "Meal planning",
            "Hormone health",
        ),
    ),
    "Life coaching": (
        r"life coach|mindset|confiden",
        ("Confidence", "Career change", "Relationships", "Mindset", "Stress & burnout", "Purpose & direction"),
    ),
    "Business coaching": (
        r"business|consult|leadership|\bgrowth",
        ("Starting a business", "Marketing", "Sales", "Leadership", "Productivity", "Personal branding"),
    ),
}


def _tile_named(text) -> str | None:
    lowered = str(text or "").strip().lower()
    return next((tile for tile in SPECIALTIES if tile.lower() == lowered), None)


def specialties_for(answers: dict) -> tuple[str, ...]:
    """The kinds to ask about when the coach picked a broad tile ("Dance"), else ()."""
    tile = _tile_named(answers.get("teaches"))
    return SPECIALTIES[tile][1] if tile else ()


def tile_of_brand(brand) -> str | None:
    """The broad tile a studio name gives away ("Zen Yoga Studio" → "Yoga"), or None."""
    lowered = str(brand or "").lower()
    found = next((tile for tile, (pattern, _) in SPECIALTIES.items() if re.search(pattern, lowered)), None)
    if found or not lowered.strip():
        return found
    from apps.core import jev

    # High bar: a wrong guess opens the first screen on the wrong kinds.
    return jev.choose(
        brand,
        "This is the name of a coach's teaching business. Does the name itself clearly say which of these they"
        " teach? Pick none when the name does not say (a person's name, an abstract brand word).",
        {tile: ", ".join(kinds) for tile, (_, kinds) in SPECIALTIES.items()},
        min_confidence=0.8,
    )


def kind_of_brand(brand) -> tuple[str, str] | None:
    """(tile, kind) when a studio name names one kind outright ("Görkem's Face
    Yoga Studio" → ("Yoga", "Face yoga")): the first question then only asks
    whether that is all they teach."""
    lowered = str(brand or "").lower()
    for tile, (_, kinds) in SPECIALTIES.items():
        for kind in kinds:
            if re.search(rf"\b{re.escape(kind.lower())}\b", lowered):
                return tile, kind
    return None


def brand_kind_options(kind: str) -> tuple[str, str]:
    return f"Only {kind.lower()}", f"{kind} and more"


def _tile_of_kinds(raw) -> tuple[str, str] | None:
    """(tile, the kinds as its own labels) when every comma-separated part of
    ``raw`` is one of that tile's kinds."""
    parts = [p.strip().lower() for p in str(raw or "").split(",") if p.strip()]
    for tile, (_, kinds) in SPECIALTIES.items():
        labels = {k.lower(): k for k in kinds}
        if parts and all(p in labels for p in parts):
            return tile, ", ".join(labels[p] for p in parts)
    return None


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
    alone: str = ""  # the option that can't be ticked with any other ("Free for now")
    icons: tuple[str, ...] = ()  # one lucide id per option (fixed-option fields)
    hints: tuple[str, ...] = ()  # one short line per option, shown under it
    details: tuple[str, ...] = ()  # one description per option, shown under it
    delegable: bool = False  # the guide may decide it for the coach ("You decide")
    starter: bool = False  # options are sentence starters the coach finishes in the box, never answers
    why: str = ""  # one line under the question: why it matters


FIELDS: tuple[Field, ...] = (
    Field(
        "teaches",
        "What they teach",
        "Let's start with you. What do you teach?",
        # The first screen, before any AI turn: eight tiles, typing covers the rest.
        (
            "Yoga",
            "Pilates",
            "Fitness coaching",
            "Dance",
            "Meditation",
            "Nutrition",
            "Life coaching",
            "Business coaching",
        ),
        icons=("flower-2", "person-standing", "dumbbell", "music", "brain", "salad", "compass", "briefcase"),
    ),
    Field(
        "specialty",
        "Their specialty",
        "Which kinds do you teach?",  # asked only after a broad tile; options from specialties_for()
        kind="specialty",
        multi=True,
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
        ("Digital Courses", "Live online classes", "In-person sessions", "Articles", "Community"),
        kind="offers",
        why="This decides which pages I build and what I ask you next.",
        multi=True,
        icons=("book-open", "video", "map-pin", "newspaper", "users"),
        details=(
            "Pre-recorded lessons students buy once and follow at their own pace.",
            "Scheduled video sessions students join from home, with you live.",
            "Classes, workshops or retreats at your own place.",
            "A blog that brings new students in from search and keeps them reading.",
            "A members' space where your students talk, share and stay motivated.",
        ),
    ),
    Field("pitch", "One-line pitch", "If someone asked what you do, what would you say in one sentence?"),
    Field(
        "difference", "What makes their approach theirs", "What do you do differently from other teachers?", multi=True
    ),
    # Before the look: the tone asked for helps rank the looks.
    Field(
        "tone",
        "How the site should sound",
        "How should your site sound?",
        ("Warm", "Energetic", "Calm", "Expert", "Playful"),
        kind="tone",
        multi=True,
        delegable=True,
        icons=("heart", "zap", "leaf", "graduation-cap", "smile"),
        hints=TONE_HINTS[""],
    ),
    Field("site_style", "Site style", "Which look feels most like you?", kind="style", delegable=True),
    Field("story", "Their story", "How did you come to teach this?", starter=True),
    Field(
        "credentials",
        "Training and experience",
        "Any training, certifications or years of teaching you'd like visitors to know about?",
        multi=True,
        starter=True,
    ),
    Field("site_logo", "Logo", "Pick a logo to start with. You can change it any time.", kind="logo", delegable=True),
    # Coaches who run classes: how the public calendar looks, and whether it is in the navbar.
    Field(
        "calendar_view",
        "Calendar layout",
        "How should your class calendar look?",
        kind="calendar",
        needs=("live", "onsite"),
        delegable=True,
    ),
    Field(
        "calendar_nav",
        "Calendar in the navbar",
        "Want your calendar in the navbar?",
        ("Yes, add it", "No, keep it off"),
        kind="calendar_nav",
        needs=("live", "onsite"),
        icons=("calendar-days", "lock-open"),
        hints=("One click from every page", "Students find it from your classes"),
    ),
    Field(
        "payments",
        "How students pay",
        "How will students pay you?",
        ("One-time course purchases", "Monthly membership", "Pay per class or event", "Free for now"),
        kind="payments",
        why="Free stays free. You can change prices any time.",
        multi=True,
        alone="Free for now",
        icons=("book-open", "repeat", "ticket", "gift"),
        hints=(
            "Students buy each course once",
            "One monthly price for everything",
            "Students pay for each live class",
            "Everything free now, prices later",
        ),
    ),
    Field(
        "memberships",
        "Memberships offered",
        "You can offer more than one membership. Which ones fit your students?",
        kind="memberships",  # options come from tiers_for()
        multi=True,
        pays=("membership",),
        delegable=True,
    ),
    Field(
        "course_topic",
        "First course topic",
        "Let's build your first course. What should it teach?",
        group="course",
        delegable=True,
    ),
    Field(
        "course_price",
        "First course price",
        "What should the course cost?",
        ("19", "29", "39", "49", "79", "99", "149", "199"),
        kind="price",
        pays=("course",),
        group="course",
        delegable=True,
    ),
    Field("course_review", "First course", "Here's your first course. Happy with it?", kind="course", group="course"),
    Field(
        "live_topic",
        "Live class topic",
        "Let's set up your first live class. What should it focus on?",
        needs=("live", "onsite"),
        group="event",
        delegable=True,
    ),
    Field(
        "live_when",
        "Live class schedule",
        "When does your first live class run?",
        ("Recurring", "One-time"),
        kind="schedule",  # the tile picks weekly or one-time; the picker sends the dates
        needs=("live", "onsite"),
        icons=("repeat", "calendar"),
        hints=("Set days and times, week after week", "A single session on one date"),
        group="event",
        delegable=True,
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
        delegable=True,
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
        delegable=True,
    ),
    Field(
        "socials",
        "Social accounts",
        "Which social accounts should students find you on?",
        ("Instagram", "YouTube", "TikTok", "Facebook", "X", "LinkedIn", "No social accounts yet"),
        kind="socials",  # tiles pick the networks; the picker takes each handle or link
        multi=True,
        alone="No social accounts yet",
        icons=("instagram", "video", "music", "users", "message-circle", "briefcase", "clock"),
    ),
    Field(
        "contact",
        "How students reach them",
        "How should students get in touch with you?",
        ("Email", "Instagram", "WhatsApp", "Phone", "Contact form"),
        kind="contact",
        multi=True,
        icons=("mail", "instagram", "message-circle", "phone", "pen-line"),
    ),
    Field(
        "location",
        "Where in-person sessions happen",
        "Where do your in-person sessions take place?",
        needs=("onsite",),
        multi=True,
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
    """A number wins over "free" ("Free first class, then $15" is 15); "free"
    alone is 0. ponytail: the first number wins ("2 free classes then 20" is
    2); fixed price tiles make that rare."""
    text = str(raw or "").lower()
    match = re.search(r"\d+(?:[.,]\d{1,2})?", text)
    if match:
        return min(float(match.group().replace(",", ".")), 9999.0)
    return 0.0 if "free" in text else None


def parse_memberships(raw) -> list[str]:
    """Tier ids named in the coach's words (labels or ids), in catalogue order."""
    if isinstance(raw, list | tuple):
        raw = " ".join(map(str, raw))
    text = str(raw or "").lower()
    return [t["id"] for t in MEMBERSHIP_TIERS if t["label"].lower() in text or re.search(rf"\b{t['id']}\b", text)]


NO_SOCIALS = "No social accounts yet"
# id: (name, profile URL for a bare handle, host pattern). The first match wins.
SOCIALS = {
    "instagram": ("Instagram", "https://instagram.com/{}", r"instagram\.com"),
    "youtube": ("YouTube", "https://youtube.com/@{}", r"youtube\.com|youtu\.be"),
    "tiktok": ("TikTok", "https://tiktok.com/@{}", r"tiktok\.com"),
    "facebook": ("Facebook", "https://facebook.com/{}", r"facebook\.com|fb\.com"),
    "x": ("X", "https://x.com/{}", r"x\.com|twitter\.com"),
    "linkedin": ("LinkedIn", "https://linkedin.com/in/{}", r"linkedin\.com"),
}
_HANDLE = re.compile(r"@?([\w.\-]{1,60})")


def social_url(network: str, raw) -> str | None:
    """A handle ("@maya") or a link as the profile URL on ``network``, or None."""
    if network not in SOCIALS:
        return None
    text = str(raw or "").strip().rstrip(".,;")
    if not text:
        return None
    _, template, host = SOCIALS[network]
    link = re.fullmatch(rf"(?:https?://)?(?:[\w-]+\.)?(?:{host})/\S{{1,200}}", text, re.I)
    if link:
        return "https://" + re.sub(r"^https?://", "", text, flags=re.I)
    handle = _HANDLE.fullmatch(text)
    return template.format(handle[1]) if handle else None


def parse_socials(raw) -> dict[str, str]:
    """Profile links named in the coach's words: links, or "Instagram: @maya"."""
    text = str(raw or "")
    found = {}
    for network, (name, _, host) in SOCIALS.items():
        hit = re.search(rf"(?:https?://)?(?:[\w-]+\.)?(?:{host})/[^\s,;]+", text, re.I) or re.search(
            rf"\b{name}\b\W{{1,3}}(@?[\w.\-]+)", text, re.I
        )
        if hit and (url := social_url(network, hit[1] if hit.re.groups else hit[0])):
            found[network] = url
    return found


def socials_summary(links: dict[str, str]) -> str:
    return "; ".join(f"{SOCIALS[n][0]}: {u}" for n, u in links.items()) or NO_SOCIALS


def coerce(field_id: str, raw):
    """What the coach said → the stored value, or None when it doesn't fit."""
    field = FIELD_BY_ID.get(field_id)
    if field is None or field.kind in CARD_KINDS:  # cards go through choose()
        return None
    if field.kind == "offers":
        return parse_offers(raw) or None
    if field.kind == "payments":
        return parse_payments(raw) or None
    if field.kind == "memberships":
        return parse_memberships(raw) or None
    if field.kind == "price":
        return parse_price(raw)
    if field.kind == "calendar_nav":
        text = str(raw or "").lower()
        return (
            "yes"
            if re.search(r"\b(yes|add|show|sure|yeah|please)\b", text)
            else "no"
            if re.search(r"\b(no|off|don.?t)\b", text)
            else None
        )
    if field.kind == "socials":
        links = parse_socials(raw)
        if links:
            return socials_summary(links)
        return NO_SOCIALS if re.search(r"\bno\b|none|later|don.?t|nothing", str(raw or ""), re.I) else None
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
    teaches = f"{answers.get('specialty') or ''} {answers.get('teaches') or ''}".lower()
    if niche != "general" and niche in teaches:
        return niche
    words = [w for w in re.findall(r"[a-z]+", teaches) if w not in _STOP_WORDS]
    return " ".join(words[:2]) or ("" if niche == "general" else niche)


# What each niche means, for Jev when the keyword table finds nothing.
_NICHE_MEANS = {
    "face_yoga": "Face yoga, facial exercises",
    "pole_dance": "Pole dance, pole fitness",
    "belly_dance": "Belly dance",
    "makeup": "Make-up artistry",
    "pilates": "Pilates, barre",
    "yoga": "Yoga of any kind",
    "outdoors": "Running, hiking, cycling, climbing, surfing, skiing and other outdoor sport",
    "martial_arts": "Martial arts and self-defence",
    "dance": "Dance of any other kind",
    "cooking": "Cooking, baking, drinks, nutrition and food",
    "music": "Music, singing, instruments, acting and performance",
    "tech": "Coding, software, data, AI and digital tools",
    "family": "Parenting, pregnancy, babies and children",
    "spiritual": "Astrology, tarot, energy healing and other spiritual practice",
    "beauty": "Skin, hair, nails, beauty, fashion and personal style",
    "crafts": "Pottery, knitting, sewing, woodwork and other handicrafts",
    "writing": "Writing, storytelling and publishing",
    "learning": "Languages, school subjects, exams, tutoring and chess",
    "creative": "Photography, painting, drawing, design, film and visual art",
    "wellness": "Mental wellbeing, mindfulness, meditation, therapy and life coaching",
    "business": "Business, career, money, marketing and leadership",
    "fitness": "Fitness, strength, gym, boxing and personal training",
}


def niche_for(text) -> str:
    lowered = str(text or "").lower()
    found = next((niche for niche, pattern in _NICHE_WORDS if re.search(pattern, lowered)), None)
    if found or not lowered.strip():
        return found or "general"
    from apps.core import jev

    return jev.choose(text, "Which field does this coach teach?", _NICHE_MEANS) or "general"


def _sync_legacy(answers: dict, field_id: str) -> None:
    """Keep the keys existing consumers read (CoachBrief, the composer,
    setup_items goals) in step with the brief."""
    if field_id in ("teaches", "specialty"):
        answers["niche"] = niche_for(f"{answers.get('specialty') or ''} {answers.get('teaches') or ''}")
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
    if field_id == "teaches":
        # Kinds picked on the first screen ("Belly dance, Hip hop", "Only face
        # yoga") are the specialty of their tile; "Face yoga and more" keeps the
        # kind and asks what else. Any other answer drops a stale specialty.
        answers.pop("specialty", None)
        answers.pop("specialty_base", None)
        value = re.sub(r"^only\s+", "", value, flags=re.I)
        more = re.fullmatch(r"(.+?)\s+and more", value, flags=re.I)
        if more and (found := _tile_of_kinds(more[1])):
            value, answers["specialty_base"] = found
        elif found := _tile_of_kinds(value):
            value, answers["specialty"] = found
    base = answers.get("specialty_base") if field_id == "specialty" else None
    if base and base.lower() not in value.lower():
        value = f"{base}, {value}"
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
        and (f.kind != "specialty" or specialties_for(answers))
    ]


def tone_hints_for(answers: dict) -> tuple[str, ...]:
    """One line per tone: the model's, written for this coach's niche, else the
    fallback of the broad tile they teach (see TONE_HINTS)."""
    if len(written := answers.get("tone_hints") or ()) == len(FIELD_BY_ID["tone"].options):
        return tuple(written)
    teaches = str(answers.get("teaches") or "")
    tile = _tile_named(teaches) or next(
        (t for t, (pattern, _) in SPECIALTIES.items() if re.search(pattern, teaches.lower())), ""
    )
    return TONE_HINTS.get(tile, TONE_HINTS[""])


def options_for(
    field: Field, answers: dict, brand: str = ""
) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """A fixed field's answers, icons and hints as this coach should see them:
    paying per class only for coaches who run classes, the memberships their
    offers allow; the kinds of a broad tile, opened straight away when the
    studio name gives the tile away."""
    tile = (
        _tile_named(answers.get("teaches"))
        if field.kind == "specialty"
        else tile_of_brand(brand)
        if field.id == "teaches"
        else None
    )
    first = FIELD_BY_ID["teaches"]
    if field.id == "teaches" and (named := kind_of_brand(brand)):
        icon = dict(zip(first.options, first.icons, strict=True)).get(named[0], "sparkles")
        return brand_kind_options(named[1]), (icon, "layers"), ()
    if tile:
        icon = dict(zip(first.options, first.icons, strict=True)).get(tile, "sparkles")
        base = str(answers.get("specialty_base") or "").lower() if field.kind == "specialty" else ""
        kinds = tuple(k for k in SPECIALTIES[tile][1] if k.lower() != base)
        return kinds, (icon,) * len(kinds), ()
    if field.kind == "memberships":
        tiers = tiers_for(answers)
        return (
            tuple(t["label"] for t in tiers),
            tuple(t["icon"] for t in tiers),
            tuple(f"${t['price']} a month" for t in tiers),
        )
    rows = list(
        zip(
            field.options,
            field.icons or ("",) * len(field.options),
            (tone_hints_for(answers) if field.id == "tone" else field.hints) or ("",) * len(field.options),
            strict=False,
        )
    )
    if field.kind == "payments" and not {"live", "onsite"} & set(answers.get("offers") or []):
        rows = [r for r in rows if r[0] != "Pay per class or event"]
    options, icons, hints = (tuple(col) for col in zip(*rows, strict=True)) if rows else ((), (), ())
    return options, icons if field.icons else (), hints if field.hints else ()


def details_for(field: Field, answers: dict) -> dict[str, str]:
    """One description per option, shown once it is picked."""
    if field.kind == "memberships":
        return {t["label"]: t["blurb"] for t in tiers_for(answers)}
    return dict(zip(field.options, field.details, strict=False)) if field.details else {}


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
        elif field.kind == "memberships":
            value = ", ".join(
                f"{TIER_BY_ID[i]['label']} (${TIER_BY_ID[i]['price']} a month)" for i in value if i in TIER_BY_ID
            )
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
