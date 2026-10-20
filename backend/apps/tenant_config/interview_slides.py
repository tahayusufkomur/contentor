"""The setup interview as a short presentation: before each new concept its
specialist presents one slide. This module owns the catalogue (code-owned
copy, nothing here is stored in the transcript), which slides are due before
the question about to be asked, and how a slide is rendered with the coach's
examples or, when there are none, field-neutral ones.

Words rule: copy shown to the creator never says teacher, coach or instructor.
"""

from dataclasses import dataclass

from . import interview_brief as brief

END = "__end__"  # slides_from value: no slide is due any more (past the last question)


@dataclass(frozen=True)
class Slide:
    key: str
    by: str  # a core.copilot.team.KEYS key
    fields: tuple[str, ...]  # trigger fields; the first one currently required is the trigger
    chapter: str
    title: str
    body: str  # {brand} is filled in render()
    next: str  # the Next button's label


SLIDES: tuple[Slide, ...] = (
    Slide(
        "team",
        "assistant",
        ("teaches",),
        "Welcome",
        "You're not doing this alone.",
        "{brand} comes with a team. They take care of the website, the payments and the marketing, so you can "
        "spend your time making great content. You'll meet each of them as we set up your site.",
        "Let's start",
    ),
    Slide(
        "site",
        "designer",
        ("photos",),
        "Your site",
        "Your site, built while we talk.",
        "Every answer goes into your pages: home, about, contact and FAQ. I start building as soon as I know "
        "enough, and you can change anything later.",
        "Next: your photos",
    ),
    Slide(
        "ways",
        "content",
        ("offers",),
        "How you'll work",
        "Five ways to work with your students.",
        "Pick as many as fit. Each one gets its place on your site, and I'll draft your first course, class or "
        "article while we talk.",
        "Choose yours",
    ),
    # Traced in code (see the task report): the pitch is what the home page's words are written from; the
    # meta description is not set from it in the interview, so "on Google" is not claimed.
    Slide(
        "reach",
        "marketing",
        ("pitch",),
        "Finding students",
        "How new students find you.",
        "Your one-line pitch shapes the first thing new visitors read on your home page. Articles and your "
        "social accounts bring more people to it.",
        "Next: your pitch",
    ),
    Slide(
        "look",
        "designer",
        ("site_style",),
        "Your look",
        "A look is how your whole site feels.",
        "It sets the fonts, the colours and the layout of every page, in light and dark. Your logo sits on top. "
        "Both change any time, and your words stay put.",
        "Next: pick a look",
    ),
    Slide(
        "pay",
        "finance",
        ("payments",),
        "Getting paid",
        "Three ways students can pay you.",
        "Most creators mix them. Here's what three of your students might pay over three months.",
        "Choose yours",
    ),
    Slide(
        "membership",
        "finance",
        ("memberships",),
        "Getting paid",
        "A membership is a monthly pass.",
        "Students pay one price each month and get everything it covers while they pay. One membership can "
        "cover everything you offer, or you can have a few, each for one thing.",
        "Next: your memberships",
    ),
    Slide(
        "access",
        "finance",
        ("course_access", "event_access", "onsite_access"),
        "Getting paid",
        "Ways in: who gets to open it.",
        "Anything you make can be free, sold on its own, part of a membership, or several of these at once. "
        "Every course and class you add later has the same Access section.",
        "Next: who can join",
    ),
    Slide(
        "course",
        "content",
        ("course_topic",),
        "Your first course",
        "A course is your know-how, recorded once.",
        "Students buy it, follow it at their own pace and keep it. It's made of modules, like weeks or "
        "chapters, and lessons, the videos inside them. I draft the outline; you record the videos.",
        "Next: your course",
    ),
    Slide(
        "live",
        "content",
        ("live_topic",),
        "Your first online class",
        "A live class happens at a set time.",
        "Students sign up on your site and join the video call from it. It can run once, or every week at the "
        "same time.",
        "Next: your class",
    ),
    Slide(
        "onsite",
        "content",
        ("onsite_topic",),
        "Your first in-person event",
        "An in-person event lives on your site too.",
        "Students see the place and the times and sign up online. The street address goes only to the students "
        "who can come.",
        "Next: your event",
    ),
    # Traced in code: the contact form posts to core.contact.views.contact_submit, which stores the message in
    # the coach's apps.mailbox inbox; notifications.tasks.send_live_reminders (celery beat, every 5 minutes)
    # reminds the students who can attend, 15 minutes before a class.
    Slide(
        "inbox",
        "community",
        ("contact",),
        "Your students",
        "When students write to you.",
        "Messages from your site land in your inbox in the studio, and class reminders go out on their own. If "
        "you run a community, that's where your students talk to each other.",
        "Next: how to reach you",
    ),
)
SLIDE_BY_KEY: dict[str, Slide] = {s.key: s for s in SLIDES}

_INDEX = {f.id: i for i, f in enumerate(brief.FIELDS)}


def due(next_field: str | None, answers: dict, record: dict, slides_from: str | None) -> list[Slide]:
    """The slides to show before ``next_field`` is asked, in catalogue order.

    A slide is due once the question it introduces is the one about to be
    asked, or was already answered in passing (its trigger comes before
    ``next_field`` and is settled), so no concept is lost. Slides already in
    ``record`` never come back; slides behind ``slides_from`` are hidden."""
    if next_field not in _INDEX:
        return []
    floor = len(brief.FIELDS) if slides_from == END else _INDEX.get(slides_from or "", 0)
    required = {f.id for f in brief.required(answers)}
    out = []
    for slide in SLIDES:
        if slide.key in record:
            continue
        trigger = next((f for f in slide.fields if f in required), None)
        if trigger is None or _INDEX[trigger] < floor:
            continue
        if trigger == next_field or (_INDEX[trigger] < _INDEX[next_field] and brief.is_settled(answers, trigger)):
            out.append(slide)
    return out


# Field-neutral examples, used for a piece the coach's own examples don't have.
FALLBACK = {
    "course_title": "The 6-week program",
    "modules": ["Week 1: The basics", "Week 2: Building the habit", "Week 3: Going further"],
    "lessons": 18,
    "course_price": 49,
    "class_title": "Tuesday evening class",
    "class_when": "Tuesdays, 7 pm",
    "class_price": 10,
    "event_title": "Weekend workshop",
    "event_place": "Your studio",
    "memberships": [
        {"name": "The Club", "price": 19, "covers": "Every live class"},
        {"name": "Course library", "price": 12, "covers": "Every course"},
    ],
    "students": [
        {"name": "Anna", "about": "Busy mum, short on time"},
        {"name": "Ben", "about": "Comes every week"},
        {"name": "Cara", "about": "Drops in when she can"},
    ],
    "way_course": "A 6-week program people buy once and follow at home",
    "way_live": "A weekly class students join from home, with you live",
    "way_onsite": "A workshop or retreat at your own place",
    "way_articles": "Posts that bring new students in from search",
    "way_community": "A members' space where your students keep each other going",
    "pitch": "{brand}: calm, strong and simple, for people with busy lives.",
    "message": "Hi! Is the Tuesday class OK for complete beginners?",
}


WAYS = ("course", "live", "onsite", "articles", "community")
money = brief.money


def _str(value) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _price(value, default) -> float:
    try:
        return float(value) if float(value) > 0 else default
    except (TypeError, ValueError):
        return default


def _text(ex: dict, key: str) -> str:
    return _str(ex.get(key)) or FALLBACK[key]


def _rows(ex: dict, key: str, need: int, fields: tuple[str, ...]) -> list[dict]:
    """The coach's first ``need`` rows of ``key`` when they are all complete
    (every field a non-empty string, a price a positive number), else the fallback's."""
    rows = ex.get(key)
    if isinstance(rows, list) and len(rows) >= need:
        rows = rows[:need]
        if all(
            isinstance(r, dict) and all(_price(r.get(f), 0) if f == "price" else _str(r.get(f)) for f in fields)
            for r in rows
        ):
            return rows
    return FALLBACK[key][:need]


def _picture(key: str, answers: dict, examples: dict | None, brand: str) -> dict:
    ex = examples or {}
    if key == "site":
        return {"pages": ["Home", "About", "Contact", "FAQ"]}
    if key == "ways":
        return {"items": [{"way": w, "example": _text(ex, f"way_{w}")} for w in WAYS]}
    if key == "reach":
        pitch = _str(ex.get("pitch")) or FALLBACK["pitch"].replace("{brand}", brand)
        return {"brand": brand, "pitch": pitch}
    if key == "pay":
        students = [{"name": r["name"], "about": r["about"]} for r in _rows(ex, "students", 3, ("name", "about"))]
        course = money(_price(ex.get("course_price"), FALLBACK["course_price"]))
        session = money(_price(ex.get("class_price"), FALLBACK["class_price"]))
        member = money(_rows(ex, "memberships", 1, ("name", "price"))[0]["price"])
        months = (("course", [course, None, None]), ("membership", [member] * 3), ("class", [session, None, session]))
        return {"students": [{**s, "way": way, "months": m} for s, (way, m) in zip(students, months, strict=True)]}
    if key == "membership":
        plans = _rows(ex, "memberships", 2, ("name", "price", "covers"))
        return {"plans": [{"name": p["name"], "price": money(p["price"]), "covers": p["covers"]} for p in plans]}
    if key == "access":
        return {"item": _text(ex, "course_title"), "ticked": ["Sold on its own", "In a membership"]}
    if key == "course":
        modules = ex.get("modules")
        if not (isinstance(modules, list) and len(modules) >= 3 and all(_str(m) for m in modules[:3])):
            modules = FALLBACK["modules"]
        lessons = ex.get("lessons")
        return {
            "title": _text(ex, "course_title"),
            "modules": [m.strip() for m in modules[:3]],
            "lessons": lessons if isinstance(lessons, int) and lessons > 0 else FALLBACK["lessons"],
            "price": money(_price(ex.get("course_price"), FALLBACK["course_price"])),
        }
    if key == "live":
        return {"title": _text(ex, "class_title"), "when": _text(ex, "class_when")}
    if key == "onsite":
        return {"title": _text(ex, "event_title"), "place": _text(ex, "event_place")}
    if key == "inbox":
        return {"name": _rows(ex, "students", 3, ("name", "about"))[0]["name"], "text": _text(ex, "message")}
    return {}  # team, look: drawn by the client


def render(slides: list[Slide], answers: dict, examples: dict | None, record: dict, brand: str) -> list[dict]:
    """Each slide as the client reads it. ``first`` is true on a presenter's
    first slide (the client introduces them there): none of their slides is in
    ``record`` and none comes earlier in ``slides``."""
    met = {SLIDE_BY_KEY[k].by for k in record if k in SLIDE_BY_KEY}
    out = []
    for slide in slides:
        out.append(
            {
                "key": slide.key,
                "by": slide.by,
                "first": slide.by not in met,
                "chapter": slide.chapter,
                "title": slide.title.format(brand=brand),
                "body": slide.body.format(brand=brand),
                "next": slide.next.format(brand=brand),
                "picture": _picture(slide.key, answers, examples, brand),
            }
        )
        met.add(slide.by)
    return out


def attach(guide: dict, answers: dict, iv: dict, brand: str) -> None:
    """Put the slides due before ``guide``'s question on the live guide (like ``cards``: never stored)."""
    seen = iv.get("slides") or {}
    guide["slides"] = render(
        due(guide["field"], answers, seen, iv.get("slides_from")), answers, iv.get("slide_examples"), seen, brand
    )


def record(tenant, key: str, skipped: bool) -> bool:
    """Remember that the coach passed slide ``key`` (seen, or skipped). False for an unknown key."""
    from . import setup_flow

    if key not in SLIDE_BY_KEY:
        return False

    def mutate(_config, flow):
        iv = dict(flow.get("interview") or {})
        iv["slides"] = {**(iv.get("slides") or {}), key: "skipped" if skipped else "seen"}
        flow["interview"] = iv

    setup_flow._update_flow(tenant, mutate)
    return True
