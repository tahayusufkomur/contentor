"""The analysis of a typed answer (spec §5.1): one structured call reads what
she typed into typed fields (the topic, price, notes, a change and what is
unclear that every kind shares, and the kind's own, such as a course's level
and counts), told the question on her screen. The flow applies them
(``flow.apply``), so she skips the questions it answered. A job on the
agents worker; when it fails, she gets the usual questions and her words
answer the one on screen (stage 1)."""

import json
from decimal import Decimal, InvalidOperation
from functools import cache

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.copilot import runs
from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs, kinds

MAX_COUNT = 12  # modules, and lessons per module
MAX_TOTAL = MAX_COUNT * MAX_COUNT
MAX_PRICE = Decimal("99999999.99")  # Course.price: 10 digits, 2 decimals
STEP = {"specialist": "content", "label": "Reading your details"}

# Static per kind, byte-identical across tenants (prompt caching); her words ride the user turn.
# ``{noun}`` is the kind's word ("course"). Each kind's RULES adds its own fields, and its own
# ``topic`` and ``unclear`` lines (what a topic is, and which fields may be unclear, differ by kind).
SHARED_RULES = (
    "A coach is creating ONE {noun} in a guided flow, one question at a time. Read what she typed ('text') "
    "and return typed fields. You also get 'question' (the question on her screen), 'outline_exists' "
    "(whether a draft of the {noun} already exists), 'cover_step' (whether she is choosing her cover), "
    "'currency' (the currency her site charges in), 'today' (her date), 'her_plans' (her subscriptions' "
    "names) and her site (brand, niche, description, her_courses).\n"
    "Rules:\n"
    "- Fill only what she said. Never guess: a field she did not mention stays empty ('', null or []).\n"
    "- answer: her answer to 'question', in her words; '' when she said something else.\n"
    "- price: 'free'; 'membership' when students get it in her membership or subscription; or a plain "
    "amount in 'currency' without a sign ('49', '19.50').\n"
    "- ways: only when she gives more than one way in, or a time limit on one (a span or dates); else null, "
    "and a single price stays in price. free: true when everyone gets it at no cost. buy: the one-time "
    "amount, as in price. plans: each of her_plans she names, by its name there ('my membership' names the "
    "one she has). Each way's window: opens_after_days / closes_after_days, whole days counted from when "
    "that student got in ('after their first month' is opens_after_days 30, 'for a year' is "
    "closes_after_days 365), or opens_on / closes_on as YYYY-MM-DD on her calendar.\n"
    "- notes: the rest she said about the {noun} (its format, its promise, her angle), short, in her "
    "words.\n"
    "- photo: only when cover_step is true (she is choosing her {noun} cover): a plain description of "
    "the photo she wants, in her words ('hands on a keyboard, no faces'); '' when she did not describe "
    "one.\n"
    "- change: a change she asks for to what is drafted, in her words; only when outline_exists is true, "
    "else ''."
)


@cache
def system_for(kind: str) -> str:
    """The kind's system prompt: the shared rules for its noun, then its own
    field rules. Built once per kind."""
    adapter = kinds.get(kind)
    shared = SHARED_RULES.replace("{noun}", adapter.NOUN)
    return f"{shared}\n{adapter.RULES}" if adapter.RULES else shared


class ClarifyOption(BaseModel):
    label: str
    value: str  # "4" | "49.00" | "free" | "beginners"...


class Unclear(BaseModel):
    field: str  # one of the kind's ``UNCLEAR_FIELDS``; ``read`` drops any other
    question: str
    options: list[ClarifyOption]


class FoundWindow(BaseModel):
    opens_after_days: int | None = None
    opens_on: str = ""  # YYYY-MM-DD
    closes_after_days: int | None = None
    closes_on: str = ""


class FoundPlan(BaseModel):
    plan: str  # one of her_plans, as named there
    window: FoundWindow | None = None


class FoundWays(BaseModel):
    """Several ways in, or one with a time limit (billing.ways); the flow writes them."""

    free: bool = False
    free_window: FoundWindow | None = None
    buy: str = ""  # the one-time amount, as ``price``
    buy_window: FoundWindow | None = None
    plans: list[FoundPlan] = []


class Found(BaseModel):
    """What every kind reads from her words; a kind adds its own fields (``adapter.FOUND``)."""

    answer: str = ""  # her answer to the question on screen, in her words; "" when she said something else
    topic: str = ""  # what students learn, short, her words
    price: str = ""  # "free" | "membership" | an amount in the site's currency ("49")
    ways: FoundWays | None = None  # more than one way in, or a window: only for a kind with the shared tiles
    notes: str = ""  # the rest she said about it: format, promise, angle
    change: str = ""  # a change to what is drafted she asked for (only when something is drafted)
    photo: str = ""  # at the cover question: a plain description of the photo she wants
    unclear: list[Unclear] = []


def read(
    tenant,
    text: str,
    *,
    kind: str,
    question: str,
    outline_exists: bool,
    currency: str,
    course_id=None,
    cover_step: bool = False,
) -> Found:
    """The model's reading of her words, into the kind's own fields. Raises core_ai.AiError."""
    from apps.billing.models import SubscriptionPlan
    from apps.core.copilot.engine import _tenant_zone

    from . import outline

    adapter = kinds.get(kind)
    today = timezone.now().astimezone(_tenant_zone(tenant)).date()
    user = json.dumps(
        {
            "text": text,
            "question": question,
            "outline_exists": outline_exists,
            "cover_step": cover_step,
            "currency": currency,
            "today": f"{today:%A} {today.isoformat()}",  # "next Tuesday" is her calendar
            "her_plans": list(SubscriptionPlan.objects.filter(is_active=True).values_list("name", flat=True)),
            **outline.site(tenant, course_id),
        },
        ensure_ascii=False,
    )
    try:
        found, cost, _model = core_ai.structured(
            system=system_for(kind),
            user=user,
            output_model=adapter.FOUND,
            model=settings.COPILOT_MODEL,
            max_tokens=4000,
            label="contentor:copilot",
            effort="medium",
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant.schema_name, getattr(exc, "cost_usd", None) or 0)
        raise
    ai_compose.record_spend(tenant.schema_name, cost)
    found.unclear = [u for u in found.unclear if u.field in adapter.UNCLEAR_FIELDS]
    if not outline_exists and (read_counts := getattr(adapter, "read_counts", None)):
        read_counts(found, text)  # an explicit count of hers must not depend on the model's reading
    return found


def brief_from(found, brief: dict) -> dict:
    """The outline's brief with what she said merged in: counts (each clamped
    to 1..12, a total to 1..144; more than that is ``capped``), the titles she
    named, and her notes. ``capped`` follows her latest counts, and a total
    replaces lessons per module (and back), so the two never disagree."""
    out = dict(brief or {})
    capped = None
    for key, cap in (("modules", MAX_COUNT), ("lessons", MAX_COUNT), ("total", MAX_TOTAL)):
        value = getattr(found, key)
        if value is None:
            continue
        capped = bool(capped) or value > cap
        out[key] = min(max(value, 1), cap)
    if found.lessons is None and found.total is not None:
        out.pop("lessons", None)
    if found.total is None and found.lessons is not None:
        out.pop("total", None)
    if found.named:
        capped = bool(capped) or len(found.named) > MAX_COUNT or any(len(m.lessons) > MAX_COUNT for m in found.named)
        out["named"] = [
            {"title": m.title.strip(), "lessons": [t.strip() for t in m.lessons if t.strip()][:MAX_COUNT]}
            for m in found.named[:MAX_COUNT]
        ]
    if capped is not None:  # her latest counts say whether she asked for more than 12
        out["capped"] = capped
    # A lone untitled module holds lessons she named without a module: not a module she counted.
    titled = sum(1 for m in out.get("named") or [] if m["title"])
    if titled > (out.get("modules") or 0):
        out["modules"] = titled
    if found.notes.strip():
        out["notes"] = " ".join(filter(None, [out.get("notes", ""), found.notes.strip()]))
    out["analysed"] = True
    return out


def price_value(raw: str) -> str | None:
    """ "free" | "membership" | "49.00"; None when it is not a price."""
    word = str(raw or "").strip().lower()
    if word in ("free", "membership"):
        return word
    try:
        amount = Decimal(word)
    except InvalidOperation:
        return None
    if not amount.is_finite() or amount < 0 or amount > MAX_PRICE:
        return None
    amount = amount.quantize(Decimal("0.01"))  # cents first: "0.004" is free, never paid at 0.00
    return "free" if amount == 0 else f"{amount:.2f}"


def carry_out(tenant, run_id) -> None:
    """Read her words outside any lock, then apply them under the creation's
    lock, unless Stop or a newer answer won meanwhile."""
    from apps.core.currency import tenant_charge_currency

    from . import flow

    if not ai_compose.compose_available():
        raise core_ai.AiError("ai_unavailable")
    creation = FocusCreation.objects.get(pk=(CopilotRun.objects.get(pk=run_id).request or {}).get("focus"))
    pending = creation.pending or {}
    if pending.get("run") != run_id:  # settled meanwhile: nothing left to read
        runs.finish(run_id, True)
        return
    runs.emit(run_id, "step", {**STEP, "state": "start"})
    found = read(
        tenant,
        str(pending.get("text") or ""),
        question=flow.question(creation.kind, pending.get("field"), creation)["question"],
        kind=creation.kind,
        outline_exists=flow.draft_started(creation),
        currency=tenant_charge_currency(tenant),
        course_id=creation.record_id if creation.kind == "course" else None,
        cover_step=pending.get("field") == "cover",
    )
    with transaction.atomic():
        creation = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        current = creation.status == "active" and (creation.pending or {}).get("run") == run_id
        if current and jobs.active(run_id):  # else Stop, "Fill it in myself" or a newer answer won
            flow.apply(creation, found)
            creation.save()
            runs.emit(run_id, "step", {**STEP, "state": "done"})
        runs.finish(run_id, True, found.model_dump(exclude_defaults=True))  # a stopped run stays stopped


def on_failure(tenant, run_id) -> None:
    """The model failed: stage 1's behaviour, while this run is still the
    answer she is waiting on."""
    from . import flow

    focus = (CopilotRun.objects.get(pk=run_id).request or {}).get("focus")
    with transaction.atomic():
        creation = FocusCreation.objects.select_for_update().filter(pk=focus).first()
        if creation is None or (creation.pending or {}).get("run") != run_id:
            return
        flow.apply(creation, None)
        creation.save()
