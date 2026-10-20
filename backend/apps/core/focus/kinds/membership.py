"""A membership in focus mode (stage E of
docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md): one price, every
month or every year, for what she already makes. Its draft is a
SubscriptionPlan off sale at price 0 from her first answer (G4, G18): nobody
can see, buy or get anything through it until her finish tap puts it on sale,
and a plan cannot be deleted (it may have subscribers), so one she leaves
stays off sale. What members get is ticked from what students can see and
linked through the ways (apps.billing.ways), so an item keeps its own price.
The price is only ever her tap or her words (F11). The site owner's alone
(flow.check_owner). Finance asks, Marketing writes and announces it (G16)."""

from decimal import Decimal
from statistics import median

from django.db import connection

from apps.tenant_config.interview_brief import MEMBERSHIP_TIERS, TIER_BY_ID, Field, answers_of, money, tiers_for

from .. import analysis, pricing
from ..recipes import Recipe

NOUN = "membership"
NEW_TITLE = "New membership"
SETUP_TOPIC = None  # its first tiles are the /setup tiers for what she has (``topic_tiles``)
COVER = None  # a plan shows no image (G7)
cover_target = cover_facts = None
ANNOUNCER = "marketing"
# The follow-up slot before the copy job drafts, and what it writes (apps.core.focus.followup).
DRAFT_SLOT = "copy"
DRAFT_WHAT = "name and description"
REVIEWED_LINE = None
FINISH = (("on_sale", "Put it on sale"), ("off_sale", "Keep it off sale"))
CLOSING = {
    "on_sale": "On sale. Students can join it from your pricing page.",
    "off_sale": "Kept off sale. Put it on sale from this page when you're ready.",
}
NOT_READY_LINE = "Your membership is kept off sale."
FINISH_SPECIALIST = "finance"  # what it still needs is Finance's (G16): its items and its price
NOTHING = "Nothing ticked"  # a tap none of whose values is one of her tiles
REFUSED_NAMES = 3  # the items a refusal line names; past that, "and N more"
SAY = "Say an amount"  # the price step's typing box: her words set the price only when they give one
CYCLES = {"month": 1, "year": 12}  # a price tile's cycle -> billing_interval_months
YEAR_HINT = "Two months free"  # the year's tile is ten months' price
SERIES = ("live", "stream", "onsite")  # never Zoom: billing cannot put one in a plan (G9)
HINTS = {
    "course": "Course",
    "live": "Live class",
    "stream": "Live stream",
    "onsite": "In-person event",
    "download": "Download",
}
# What each of her items is, as /setup's offers name it (the tiers' ``needs``).
OFFER = {"course": "course", "download": "course", "live": "live", "stream": "live", "onsite": "onsite"}
# A linked item's model, as the copy and the closest tier read it.
MODEL_KIND = {
    "course": "course",
    "downloadfile": "download",
    "liveclass": "live",
    "livestream": "stream",
    "onsiteevent": "onsite",
}

RECIPE = Recipe(
    kind="membership",
    questions=(
        Field(
            "topic",
            "Membership",
            "What do members get?",
            ("Members get ",),
            delegable=True,
            starter=True,
            why="Pick one to start from, or say it in your words. I'll fill in the rest for you to check.",
        ),
        Field(
            "included",
            "Included",
            "What's included?",
            kind="pick",  # options are her items, drawn per creation (``ask``); hers to tick, never delegated
            multi=True,
            why="Tick everything members get. You can change it any time.",
        ),
        Field(
            "review",
            "Membership",
            "Here's your membership. Does it fit?",
            kind="review",
            why="Say what to change, or edit it on the page yourself.",
        ),
        Field(
            "access",
            "Price",
            "What should it cost?",
            kind="price",
            # Only "Just draft it" delegates it, and that leaves the price to her finish tap ("Sell it for"):
            # the plan stays at 0, off sale (F11).
            delegable=True,
            why="Members pay it every month or every year. You can change it any time.",
        ),
        Field(
            "finish",
            "Finish",
            "Ready. Put it on sale?",
            kind="finish",
            why="It stays off sale, hidden from students, until you put it on sale.",
        ),
        # Only after "Put it on sale" with "Tell my students" ticked; answered by its own taps.
        Field("announce", "Announcement", "Tell your students?", kind="announce"),
    ),
    # G16: Finance asks the membership's questions and its price, Marketing writes and announces it.
    specialists={
        "topic": "finance",
        "included": "finance",
        "review": "marketing",
        "access": "finance",
        "finish": "finance",
        "announce": "marketing",
    },
    values={},
)


class MembershipFound(analysis.Found):
    """What the analysis reads from her words about a membership, besides what every kind shares."""

    included: list[str] = []  # the titles of her items she named as part of it, as she wrote them
    cycle: str = ""  # month | year | "" (how often members pay, when she said)


FOUND = MembershipFound
# Appended to the shared rules in the analysis prompt (apps.core.focus.analysis.system_for).
RULES = (
    "- topic: what members get, short, in her words.\n"
    "- included: the titles of her courses, classes and downloads she named as part of it, as she wrote "
    "them; [] when she named none. Never a title she did not name.\n"
    "- cycle: 'month' when members pay monthly, 'year' when yearly; '' when she did not say.\n"
    "- A price is what members pay each month or year.\n"
    "- unclear: an amount she gave vaguely ('around 10-15'), or a price in a currency other than "
    "'currency', becomes one item instead of a value: its field (price), one short question, and 2-4 "
    "options, each a short label and its value (an amount like '12'). Leave price itself empty."
)
UNCLEAR_FIELDS = ("price",)


# ── What members can get: her items students can see ────────────────────────


def _choices(sold: bool = False) -> list[dict]:
    """One tile per published course, class series with a session to come
    (rows of one kind with one title, apps.live.series; never a held draft,
    never Zoom) and published download: ``course:<id>``, ``event:<kind>:<id of
    its first row>``, ``download:<id>``. ``sold``: only what students can buy
    on its own (a bundle's): a one-time price above 0, a session to come at
    one, a download with its file; the same values as without it."""
    from django.utils import timezone

    from apps.core.copilot import content
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile

    def tiles(prefix, hint, rows):
        return [{"value": f"{prefix}:{pk}", "label": title, "hint": hint} for pk, title in rows]

    paid = {"pricing_type": "paid", "price__gt": 0} if sold else {}
    courses = Course.objects.filter(is_published=True, **paid).values_list("pk", "title")
    out = tiles("course", HINTS["course"], courses)
    now = timezone.now()
    for kind in SERIES:
        firsts: dict[str, int] = {}
        to_come = set()
        published = content.event_model(kind).objects.exclude(status="draft").order_by("pk")
        for pk, title, at, pricing_type, price in published.values_list(
            "pk", "title", "scheduled_at", "pricing_type", "price"
        ):
            firsts.setdefault(title, pk)
            if at and at > now and (not sold or (pricing_type == "paid" and price > 0)):
                to_come.add(title)
        out += tiles(f"event:{kind}", HINTS[kind], sorted((pk, t) for t, pk in firsts.items() if t in to_come))
    downloads = DownloadFile.objects.filter(is_published=True, **paid)
    if sold:
        downloads = downloads.exclude(file_url="")  # the store shows it only with its file
    return out + tiles("download", HINTS["download"], downloads.values_list("pk", "title"))


def _kind(value: str) -> str:
    parts = value.split(":")
    return parts[1] if parts[0] == "event" else parts[0]


def _rows_of(value: str) -> list:
    """Every row a tile's value stands for, in any state: a course or a
    download, or every session of a class series. [] for a value that is not one."""
    from apps.core.copilot import content
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile
    from apps.live import series

    parts = str(value).split(":")
    pk = parts[-1]
    if not (pk.isascii() and pk.isdigit() and len(pk) < 10):
        return []
    if parts[0] == "course" and len(parts) == 2:
        return list(Course.objects.filter(pk=pk))
    if parts[0] == "download" and len(parts) == 2:
        return list(DownloadFile.objects.filter(pk=pk))
    if parts[0] == "event" and len(parts) == 3 and parts[1] in SERIES:
        first = content.event_model(parts[1]).objects.filter(pk=pk).first()
        return list(series.rows(first)) if first else []
    return []


def _ticked(raw) -> list[str]:
    """Her tap's values (comma-separated; "all" is every tile), those on her tiles, in tile order."""
    picked = {v.strip() for v in str(raw or "").split(",")}
    values = [c["value"] for c in _choices()]
    return values if "all" in picked else [v for v in values if v in picked]


def _named(titles, choices: list[dict] | None = None) -> list[str]:
    """The tiles her words named: each an exact title (any case), else the one
    title it is a unique start of; never one she did not name. In tile order.
    ``choices``: the tiles to name from (her items students can see, else)."""
    choices = _choices() if choices is None else choices
    named = set()
    for title in titles:
        title = str(title).strip().lower()
        if not title:
            continue
        exact = [c["value"] for c in choices if c["label"].lower() == title]
        starts = [c["value"] for c in choices if c["label"].lower().startswith(title)]
        named.update(exact or (starts if len(starts) == 1 else []))
    return [c["value"] for c in choices if c["value"] in named]


def _link(value: str, plan_id: int, on: bool, reasons: list[str] | None = None) -> bool:
    """The plan added to (or taken from) each row's ways in, so a ticked item
    keeps its own price and every other way in (Ruling 1); a row already in it
    keeps its window. True once every row is in it (or out of it). The ways
    refuse some (a paid item at 0, or taking the last way in from a
    members-only one): those rows are left as they are, it is False, and the
    ways' reason goes on ``reasons``."""
    from apps.billing import ways

    done = True
    for row in _rows_of(value):
        current = ways.ways_of(row)
        if on == any(p["plan_id"] == plan_id for p in current["plans"]):
            continue
        plans = [p for p in current["plans"] if p["plan_id"] != plan_id]
        try:
            ways.set_ways(row, {**current, "plans": [*plans, {"plan_id": plan_id, "window": None}] if on else plans})
        except ways.WaysError as refused:
            done = False
            if reasons is not None:
                reasons.append(str(refused))
    return done


def refused_line(titles: list[str], reasons: list[str]) -> str:
    """What a tap could not add, in one line: "A and B could not be added: Add
    a price above 0." A few names, then "and N more"; the ways' reasons, each once."""
    names = titles[:REFUSED_NAMES]
    if len(titles) > REFUSED_NAMES:
        names.append(f"{len(titles) - REFUSED_NAMES} more")
    named = names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"
    why = " ".join(dict.fromkeys(r for r in reasons if r))
    return f"{named} could not be added" + (f": {why}" if why else ".")


# ── The draft ───────────────────────────────────────────────────────────────


def _rows(pk):
    from apps.billing.models import SubscriptionPlan

    return SubscriptionPlan.objects.filter(pk=pk) if pk else SubscriptionPlan.objects.none()


def create_draft(actor, title: str, answers: dict) -> int:
    """The plan off sale at price 0, from her first answer; made here, not
    through the serializer, which refuses a price of 0."""
    from apps.billing.models import SubscriptionPlan
    from apps.core.currency import tenant_charge_currency

    plan = SubscriptionPlan.objects.create(
        name=title[:100], price=0, is_active=False, billing_interval_months=1, currency=tenant_charge_currency()
    )
    return plan.pk


def record(pk):
    return _rows(pk).first()


def payload(row) -> dict:
    return {"id": row.pk, "kind": "membership", "title": row.name, "path": f"/admin/store/plans/{row.pk}"}


def owned_by(row, user) -> bool:
    """A plan has no instructor: the site owner's (the plain form's timing stamp)."""
    return getattr(user, "role", None) == "owner"


def retitle(pk, provisional: str, title: str) -> bool:
    return bool(_rows(pk).filter(name=provisional).update(name=title[:100]))


def start_draft(creation, instruction: str = ""):
    """The copy job: the review step's name and description (apps.core.focus.copywriter)."""
    from .. import copywriter

    return copywriter.start(creation, instruction=instruction)


def skips(creation) -> set[str]:
    """What's included, while she has nothing students can see to put in it:
    the finish keeps it off sale until she has (F5)."""
    return set() if "included" in (creation.answers or {}) or _choices() else {"included"}


def topic_tiles() -> list[dict]:
    """The first question's tiles: the /setup tiers for what she makes (her
    courses and downloads, live classes, in-person events, and her community
    when /setup has it). A tap's value is the tier's name, the plan's name."""
    answers = answers_of(connection.tenant)
    have = {OFFER[_kind(c["value"])] for c in _choices()} | ({"community"} & set(answers.get("offers") or []))
    tiers = tiers_for({**answers, "offers": sorted(have)}) if have else []
    return [{"value": t["label"], "label": t["label"], "hint": t["blurb"]} for t in tiers]


def ask(creation, asked: dict) -> dict:
    """What's included: her items as tiles, those her words named ticked.
    What her last ticks could not add leads the question after them (or that
    one again, when nothing could be added)."""
    refused = (creation.brief or {}).get("refused")
    if refused and asked["field"] in ("included", "review"):
        asked = {**asked, "why": f"{refused} {asked['why']}".strip()}
    if asked["field"] != "included":
        return asked
    choices = _choices()
    values = {c["value"] for c in choices}
    named = (creation.brief or {}).get("included") or []
    return {**asked, "options": choices, "ticked": [v for v in named if v in values]}


def label(field, answer) -> str | None:
    """Her answered line: what's included by title ("4 items" past three), and a price tile's cycle."""
    if field == "included":
        values = answer if isinstance(answer, list) else _ticked(answer)
        if not values:
            return NOTHING
        count = f"{len(values)} item" + ("s" if len(values) > 1 else "")
        if len(values) > 3:
            return count
        return ", ".join(rows[0].title for v in values if (rows := _rows_of(v))) or count
    if field == "access" and isinstance(answer, str):
        cycle, _, amount = answer.partition(":")
        price = analysis.price_value(amount) if cycle in CYCLES else None
        if price not in (None, "free", "membership"):
            return f"{money(price)} a {cycle}"
    return None


# ── Her answers ─────────────────────────────────────────────────────────────


def apply_found(creation, found) -> None:
    """Her typed answer, read: the items she named are ticked (onto what's
    included when she answered it already), her cycle goes on the plan, and
    the rest is kept for the copy. Call under the creation's lock; the caller saves."""
    brief = dict(creation.brief or {})
    if found.notes.strip():
        brief["notes"] = " ".join(filter(None, [brief.get("notes", ""), found.notes.strip()]))
    if found.included and (named := _named(found.included)):
        brief["included"] = [*(brief.get("included") or []), *(v for v in named if v not in brief.get("included", []))]
        answered = creation.answers.get("included")
        if isinstance(answered, list):
            creation.answers["included"] = [*answered, *(v for v in named if v not in answered)]
    creation.brief = brief
    plan = record(creation.record_id)
    if found.cycle in CYCLES and plan is not None and plan.billing_interval_months != CYCLES[found.cycle]:
        fields = {"billing_interval_months": CYCLES[found.cycle]}
        # A new cycle with no price in her words: the price she set was for the other one, so it is asked
        # again, never rescaled into one she did not give (F11, F15). With one, the flow sets it after this.
        if plan.price > 0 and analysis.price_value(found.price) in (None, "free", "membership"):
            fields["price"] = 0
            creation.answers.pop("price", None)
            creation.answers.pop("access", None)
        _rows(plan.pk).update(**fields)


def apply_change(creation, found, *, field, text, item, clarified, fresh) -> None:
    """Her words at the included question answer it with what they ticked.
    Once the copy is drafted, a change she asks for redrafts it with her words;
    at the review, any words but a price alone are one. Call under the
    creation's lock; the caller saves."""
    from .. import flow

    ticked = (creation.brief or {}).get("included")
    if field == "included" and "included" not in creation.answers and ticked:
        creation.answers["included"] = list(ticked)
        return
    at_review = field == "review" and (found.answer.strip() or not analysis.price_value(found.price))
    if flow.draft_started(creation) and (found.change.strip() or at_review):
        flow._redraft(creation, text)


def apply_clarified(creation, field, value) -> bool:
    return False


def sync(creation) -> None:
    """After every answer: a tap's ticks, checked against her tiles, are
    linked into the plan, and anything she unticked is taken out, only where
    this flow linked it (her links on the page stay). Only what is linked stays
    ticked; with nothing, the question is asked again. A free price is no
    membership's: her price is asked again. Call under the creation's lock;
    the caller saves."""
    answers = creation.answers
    if isinstance(answers.get("included"), str):
        answers["included"] = _ticked(answers["included"])
    wanted = answers.get("included")
    if isinstance(wanted, list) and creation.record_id is not None:
        done = (creation.drafted or {}).get("included") or []
        if wanted != done:
            # Kept: what is linked. A tick the ways refuse is dropped, and named to her; an untick they
            # refuse stays ticked.
            reasons: list[str] = []
            kept = [v for v in wanted if v in done or _link(v, creation.record_id, on=True, reasons=reasons)]
            refused = [rows[0].title for v in wanted if v not in kept and (rows := _rows_of(v))]
            brief = {k: v for k, v in (creation.brief or {}).items() if k != "refused"}
            creation.brief = {**brief, "refused": refused_line(refused, reasons)} if refused else brief
            kept += [v for v in done if v not in wanted and not _link(v, creation.record_id, on=False)]
            creation.drafted = {**(creation.drafted or {}), "included": kept}
            wanted = kept
        if wanted:
            answers["included"] = wanted
        else:  # nothing in it: asked again
            answers.pop("included")
    if answers.get("price") in ("free", "membership"):
        answers.pop("price")
        if answers.get("access") == "free":
            answers.pop("access")


# ── The copy: the review step's name and description (G5) ───────────────────

COPY_FIELDS = ("name", "description")
# Appended to the copy job's shared prompt (apps.core.focus.copywriter.system_for).
COPY_RULES = (
    "Write a membership name under 60 characters and a 2–4 sentence description for students: what members "
    "get and who it is for, only from what she said and what is included.\n"
    "- topic: what members get, in her words; '' means pick one that fits her site and what is included.\n"
    "- included: what members get, each title with what it is; name nothing else as included.\n"
    "- notes and followups: what else she said about it; follow it.\n"
    "- Never write a price, a billing cycle, a number of sessions, a result or a promise she did not give."
)


def _included(row) -> list[str]:
    """What the plan includes, each title with what it is ("Yoga basics (course)"); a series once."""
    from apps.billing.models import SubscriptionPlanAccess

    out: list[str] = []
    for link in SubscriptionPlanAccess.objects.filter(plan=row).select_related("content_type"):
        kind = MODEL_KIND.get(link.content_type.model)
        title = (
            kind
            and link.content_type.model_class()
            .objects.filter(pk=link.object_id)
            .values_list("title", flat=True)
            .first()
        )
        if title and (entry := f"{title} ({HINTS[kind].lower()})") not in out:
            out.append(entry)
    return out


def copy_facts(creation, row) -> dict:
    """What the copy job writes from: her words, what is included, and her site."""
    from .. import flow, outline

    answers, brief = creation.answers or {}, creation.brief or {}
    topic = str(answers.get("topic") or "")
    site = outline.site(connection.tenant)
    return {
        "topic": "" if topic == flow.DELEGATE else topic,
        "included": _included(row),
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
        **{key: site[key] for key in ("brand", "niche", "description")},
    }


def write_copy(pk, fields: dict) -> None:
    """Written to the model, never through the serializer, and only while it is off sale."""
    _rows(pk).filter(is_active=False).update(**fields)


# ── Price, checks and going live ────────────────────────────────────────────


def set_price(pk, value: str) -> None:
    """Her price: a tile's "month:<amount>" or "year:<amount>" sets its cycle
    too; an amount alone (her words, or "Sell it for") keeps the plan's cycle.
    Never free: a membership is paid, or off sale."""
    cycle, _, amount = str(value).rpartition(":")
    price = analysis.price_value(amount)
    if price in (None, "free", "membership"):
        return
    fields = {"price": Decimal(price)}
    if cycle in CYCLES:
        fields["billing_interval_months"] = CYCLES[cycle]
    _rows(pk).update(**fields)


def price_tiles(creation, row) -> dict | None:
    """The suggested monthly price with its reason, a year at what her yearly
    memberships cost (else ten months' price), and "Say an amount" (the typing
    box; not a tile, so it never answers)."""
    if row is None:
        return None
    s = _monthly(row)
    y = _yearly(row) or pricing.Suggestion(s.amount * 10, YEAR_HINT)
    month = {"value": f"month:{s.amount}", "label": f"{money(s.amount)} a month", "hint": s.reason}
    yearly = {"value": f"year:{y.amount}", "label": f"{money(y.amount)} a year", "hint": y.reason}
    return {"options": [month, yearly], "suggested": month["value"], "say": SAY}


def _tier(row) -> dict:
    """The catalogue tier closest to it: the one its name names, else the one
    its items make (several kinds: all-access)."""
    from apps.billing.models import SubscriptionPlanAccess

    name = row.name.lower()
    if tier := next((t for t in MEMBERSHIP_TIERS if t["label"].lower() in name), None):
        return tier
    models = SubscriptionPlanAccess.objects.filter(plan=row).values_list("content_type__model", flat=True)
    have = {OFFER[MODEL_KIND[m]] for m in models if m in MODEL_KIND}
    return TIER_BY_ID[
        "all" if len(have) > 1 else {"live": "online", "onsite": "studio"}.get(next(iter(have), ""), "digital")
    ]


def suggest_price(row) -> pricing.Suggestion | None:
    """Its price for its cycle, with a reason for that cycle ("Sell it for"
    after "Just draft it" keeps the cycle her words gave): a year is what her
    yearly memberships cost, else ten months. None once it has a price: one
    she typed on the page stands (F11)."""
    if row.price > 0:
        return None
    months = row.billing_interval_months
    if months == 12 and (y := _yearly(row)):
        return y
    s = _monthly(row)
    if months == 1:
        return s
    if months == 12:
        return pricing.Suggestion(s.amount * 10, f"Two months free on {money(s.amount)} a month")
    return pricing.Suggestion(s.amount * months, f"{months} months at {money(s.amount)} a month")


def amount_label(row, amount: str) -> str:
    """An amount with its cycle, as her finish step says it: "$9 a month", "$90 a year"."""
    months = row.billing_interval_months if row is not None else 1
    return f"{money(amount)} " + {1: "a month", 12: "a year"}.get(months, f"every {months} months")


def _yearly(row) -> pricing.Suggestion | None:
    """Her other yearly memberships on sale, or None without one."""
    return _her_plans(row, 12, "a year")


def _her_plans(row, months: int, per: str) -> pricing.Suggestion | None:
    """The median of her other memberships on sale billed every ``months``,
    with them as the reason ("Annual Pass costs $349 a year"); None without one."""
    from apps.billing.models import SubscriptionPlan

    others = list(
        SubscriptionPlan.objects.filter(is_active=True, price__gt=0, billing_interval_months=months)
        .exclude(pk=row.pk)
        .order_by("price")
    )
    if not others:
        return None
    low, high = others[0].price, others[-1].price
    if len(others) == 1:
        reason = f"{others[0].name} costs {money(low)} {per}"
    else:
        reason = f"Your other memberships cost {money(low)}" + (f"–{money(high)}" if high != low else "") + f" {per}"
    return pricing.Suggestion(pricing.whole(median(p.price for p in others)), reason)


def _monthly(row) -> pricing.Suggestion:
    """The first rule that has her numbers: her other monthly memberships on
    sale, the price she gave this tier when she picked it in /setup, else the
    catalogue's price for the closest tier."""
    if s := _her_plans(row, 1, "a month"):
        return s
    tier = _tier(row)
    answers = answers_of(connection.tenant)
    prices = answers.get("membership_prices") or {}
    for key in (tier["id"], row.name):
        if key in (answers.get("memberships") or []) and prices.get(key):
            return pricing.Suggestion(pricing.whole(Decimal(str(prices[key]))), pricing.SETUP)
    return pricing.Suggestion(Decimal(tier["price"]), pricing.FALLBACK)


def not_ready(row) -> str:
    """What members get, then a price: billing's rule, which the plan page's On sale switch keeps too."""
    return row.not_ready()


def cannot_sell(row) -> bool:
    """Always paid: off sale while selling is not open yet (billing's rule, as ``not_ready``)."""
    return row.cannot_sell()


def go_live(pk) -> None:
    _rows(pk).update(is_active=True)


# ── The announcement ────────────────────────────────────────────────────────


def announce_facts(row) -> dict:
    return {"what": NOUN, "title": row.name, "description": row.description, "link": f"/plans/{row.pk}", "when": ""}
