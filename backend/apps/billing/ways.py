"""The ways into an item (free, sell it once, plans), each with a time window.

The one place that reads and writes them. The item keeps ``pricing_type`` and
``price`` (what the paywall reads today); windows live in ``AccessWindow`` rows
(free and buy) and on the plan links. See the access-rights spec, section 5.5.
"""

import re
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils.formats import date_format
from django.utils.text import get_text_list
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy, ngettext

from apps.billing.models import AccessWindow, SubscriptionPlan, SubscriptionPlanAccess

KINDS = {
    "course": "courses.course",
    "download": "downloads.downloadfile",
    "live_class": "live.liveclass",
    "live_stream": "live.livestream",
    "onsite_event": "live.onsiteevent",
    "zoom_class": "live.zoomclass",
    "bundle": "billing.bundle",
}
ALLOWED = dict.fromkeys(KINDS, ("free", "buy", "plans"))
ALLOWED["zoom_class"] = ("free",)
ALLOWED["bundle"] = ("buy",)

_NOT_ALLOWED = {
    "zoom_class": gettext_lazy("A Zoom session is free only."),
    "bundle": gettext_lazy("A bundle is sold once only."),
}
_WINDOW_KEYS = ("opens_after_days", "opens_on", "closes_after_days", "closes_on")
_MAX_DAYS = 3650
_MAX_PRICE = Decimal("99999999.99")


class WaysError(Exception):
    """Why a change to an item's ways in was refused; ``str()`` is a sentence for the creator."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


# ---- items -----------------------------------------------------------------


def item_for(kind: str, pk: int):
    missing = WaysError("not_found", _("I could not find that item."))
    if kind not in KINDS:
        raise missing
    model = apps.get_model(KINDS[kind])
    try:
        return model.objects.get(pk=pk)
    except (model.DoesNotExist, ValueError, TypeError):
        raise missing from None


def title_of(item) -> str:
    """What the creator calls it: a bundle has a name, everything else a title."""
    return getattr(item, "title", None) or getattr(item, "name", "")


def kind_of(item) -> str:
    for kind, label in KINDS.items():
        if label == item._meta.label_lower:
            return kind
    raise WaysError("not_found", _("That kind of item has no ways in to set."))


# ---- reading -----------------------------------------------------------------


def _window_of(row) -> dict | None:
    out = {key: getattr(row, key) for key in _WINDOW_KEYS if getattr(row, key) is not None}
    return {k: v.isoformat() if isinstance(v, date) else v for k, v in out.items()} or None


def _trial_ways(item) -> dict | None:
    """The ways a free-trial session goes back to (apps.live.series.set_trial), or None for any other item.
    While it is a trial its own columns say "free for everyone"; ``ways_of`` and ``set_ways`` speak for the
    ways it keeps instead, so a copy, an edit or an undo of the series' ways never sees or writes the free one.
    A subscription that was deleted since is left out."""
    if not getattr(item, "is_trial", False) or not item.trial_ways:
        return None
    kept = item.trial_ways
    live = set(
        SubscriptionPlan.objects.filter(pk__in=[p["plan_id"] for p in kept["plans"]]).values_list("pk", flat=True)
    )
    return {**kept, "plans": [p for p in kept["plans"] if p["plan_id"] in live]}


def ways_of(item) -> dict:
    if (kept := _trial_ways(item)) is not None:
        return kept
    ctype = ContentType.objects.get_for_model(item)
    windows = {w.way: w for w in AccessWindow.objects.filter(content_type=ctype, object_id=item.pk)}
    links = SubscriptionPlanAccess.objects.filter(content_type=ctype, object_id=item.pk).order_by("pk")
    price = Decimal(item.price or 0)
    free = item.pricing_type == "free" or "free" in windows
    # Free with no window covers everyone; a price kept beside it is still a way, just covered.
    buy = item.pricing_type == "paid" or (free and "free" not in windows and price > 0)
    return {
        "free": {"window": _window_of(windows["free"]) if "free" in windows else None} if free else None,
        "buy": {"price": f"{price:.2f}", "window": _window_of(windows["buy"]) if "buy" in windows else None}
        if buy
        else None,
        "plans": [{"plan_id": link.plan_id, "window": _window_of(link)} for link in links],
    }


def common_setup(kind: str) -> dict | None:
    """The ways in most of her items of ``kind`` use, drafts aside and each title once (a weekly series is
    one class): {"free": bool, "buy": bool, "plans": [plan ids]}, a tie going to the newest. None without any."""
    model = apps.get_model(KINDS[kind])
    fields = {f.name for f in model._meta.get_fields()}
    items = model.objects.order_by("-pk")
    if "is_published" in fields:
        items = items.filter(is_published=True)
    elif "status" in fields:
        items = items.exclude(status="draft")
    seen, counts = set(), Counter()
    for item in items[:50]:  # ponytail: the newest 50, a few queries each; a cached tally if she has hundreds
        if (title := title_of(item)) in seen:
            continue
        seen.add(title)
        w = ways_of(item)
        counts[(bool(w["free"]), bool(w["buy"]), tuple(sorted(p["plan_id"] for p in w["plans"])))] += 1
    if not counts:
        return None
    (free, buy, plans), _ = counts.most_common(1)[0]
    return {"free": free, "buy": buy, "plans": list(plans)}


# ---- checking ----------------------------------------------------------------


def _clean_window(window, what: str) -> dict | None:
    if window in (None, {}):
        return None
    bad = WaysError(
        "window",
        _("The dates for %(what)s are not valid. Use whole days from 1 to %(max)d, or a calendar date.")
        % {"what": what, "max": _MAX_DAYS},
    )
    if not isinstance(window, dict) or set(window) - set(_WINDOW_KEYS):
        raise bad
    out = {}
    for key, value in window.items():
        if value is None:
            continue
        if key.endswith("_days"):
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= _MAX_DAYS:
                raise bad
        else:
            if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                raise bad
            try:
                date.fromisoformat(value)
            except ValueError:
                raise bad from None
        out[key] = value
    if ("opens_after_days" in out and "opens_on" in out) or ("closes_after_days" in out and "closes_on" in out):
        raise WaysError("window", _("Give %(what)s a span or a calendar date for each end, not both.") % {"what": what})
    for opens, closes in (("opens_after_days", "closes_after_days"), ("opens_on", "closes_on")):
        if (
            opens in out
            and closes in out
            and (out[closes] <= out[opens] if opens.endswith("_days") else out[closes] < out[opens])
        ):
            raise WaysError("window", _("The dates for %(what)s close before they open.") % {"what": what})
    return out or None


def _amount(raw) -> Decimal:
    """A price as typed ("49", "49,90") to two places; anything unreadable or non-finite is a price error."""
    try:
        amount = Decimal(str(raw).strip().replace(",", ".")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        amount = None
    if amount is None or not amount.is_finite():
        raise WaysError("price", _("Add a price above 0."))
    return amount


def _clean(item, ways: dict, actor) -> dict:
    """The ways with the price as a Decimal and windows checked, or a WaysError. Writes nothing."""
    kind = kind_of(item)
    unreadable = WaysError("no_way", _("I could not read those settings."))
    if not isinstance(ways, dict):
        raise unreadable
    free, buy, plans = ways.get("free"), ways.get("buy"), ways.get("plans") or []
    if any(x is not None and not isinstance(x, dict) for x in (free, buy)):
        raise unreadable
    if not isinstance(plans, list) or not all(isinstance(p, dict) for p in plans):
        raise WaysError("plan", _("I could not read which subscriptions to include."))

    for way, given in (("free", free is not None), ("buy", buy is not None), ("plans", bool(plans))):
        if given and way not in ALLOWED[kind]:
            raise WaysError("not_allowed", _NOT_ALLOWED[kind])
    if free is None and buy is None and not plans:
        raise WaysError("no_way", _("Choose at least one way in: free, sold once, or in a subscription."))

    out = {"free": None, "buy": None, "plans": []}
    if free is not None:
        out["free"] = {"window": _clean_window(free.get("window"), _("free access"))}
    if buy is not None:
        price = _amount(buy.get("price"))
        if not 0 < price <= _MAX_PRICE:
            raise WaysError("price", _("Add a price above 0."))
        out["buy"] = {"price": price, "window": _clean_window(buy.get("window"), _("the one-time sale"))}

    ids = [p.get("plan_id") for p in plans]
    if len(set(ids)) != len(ids):
        raise WaysError("plan", _("A subscription is listed twice."))
    known = set(
        SubscriptionPlan.objects.filter(pk__in=[i for i in ids if isinstance(i, int)]).values_list("pk", flat=True)
    )
    if not known.issuperset(ids):
        raise WaysError("plan", _("One of those subscriptions no longer exists."))
    out["plans"] = [
        {"plan_id": p["plan_id"], "window": _clean_window(p.get("window"), _("a subscription"))} for p in plans
    ]

    if actor is not None and getattr(actor, "role", None) != "owner":
        if kind == "bundle":
            raise WaysError("owner_only", _("Only the owner can change a bundle's terms."))
        ctype = ContentType.objects.get_for_model(item)
        linked = SubscriptionPlanAccess.objects.filter(content_type=ctype, object_id=item.pk)
        was = {link.plan_id: _window_of(link) for link in linked}
        if (kept := _trial_ways(item)) is not None:  # a trial session's own links are gone: its kept ways count
            was = {p["plan_id"]: p["window"] for p in kept["plans"]}
        # A plan's window is live for every member, so it is the owner's too (Ruling 18).
        if was != {p["plan_id"]: p["window"] for p in out["plans"]}:
            raise WaysError("owner_only", _("Only the owner can change which subscriptions include this."))
    return out


def validate(item, ways: dict, *, actor=None) -> None:
    _clean(item, ways, actor)


# ---- writing -----------------------------------------------------------------


def _window_fields(window: dict | None) -> dict:
    window = window or {}
    return {
        key: date.fromisoformat(window[key]) if key.endswith("_on") and key in window else window.get(key)
        for key in _WINDOW_KEYS
    }


def set_ways(item, ways: dict, *, actor=None, raw: bool = False) -> dict:
    """Write the item's ways. On a free-trial session they are the ways it goes back to when the trial ends:
    its own stay free. ``raw`` writes the columns whatever it is (only ``apps.live.series.set_trial`` does)."""
    clean = _clean(item, ways, actor)  # validate's checks, keeping the normalised values
    free, buy, plans = clean["free"], clean["buy"], clean["plans"]
    if getattr(item, "is_trial", False) and not raw:
        item.trial_ways = {
            "free": free and {"window": free["window"]},
            "buy": buy and {"price": f"{buy['price']:.2f}", "window": buy["window"]},
            "plans": plans,
        }
        item.save(update_fields=["trial_ways"])
        return ways_of(item)
    ctype = ContentType.objects.get_for_model(item)
    with transaction.atomic():
        wanted = {way: s["window"] for way, s in (("free", free), ("buy", buy)) if s and s["window"]}
        AccessWindow.objects.filter(content_type=ctype, object_id=item.pk).exclude(way__in=wanted).delete()
        for way, window in wanted.items():
            AccessWindow.objects.update_or_create(
                content_type=ctype, object_id=item.pk, way=way, defaults=_window_fields(window)
            )

        SubscriptionPlanAccess.objects.filter(content_type=ctype, object_id=item.pk).exclude(
            plan_id__in=[p["plan_id"] for p in plans]
        ).delete()
        for p in plans:
            SubscriptionPlanAccess.objects.update_or_create(
                plan_id=p["plan_id"], content_type=ctype, object_id=item.pk, defaults=_window_fields(p["window"])
            )

        item.price = buy["price"] if buy else Decimal(0)
        fields = ["price"]
        if kind_of(item) != "bundle":  # a bundle's "paid" is fixed, not a column
            if free and not free["window"]:
                item.pricing_type = "free"
            else:
                item.pricing_type = "paid" if buy else "subscription" if plans else "free"
            fields.append("pricing_type")
        item.save(update_fields=fields)
    return ways_of(item)


def copy_ways(source, target) -> None:
    """Give ``target`` the same ways in as ``source``: price, windows and plan links.
    ``ways_of`` carries every window, so a ``set_ways`` round trip is a faithful copy."""
    set_ways(target, ways_of(source))


def apply_shorthand(item, *, pricing_type: str | None = None, price=None, actor=None) -> dict:
    """The old item payload (pricing_type / price) as a change to the ways."""
    current = ways_of(item)
    ways = dict(current)
    buy_window = (current["buy"] or {}).get("window")
    if pricing_type == "free":
        ways["free"] = {"window": None}
    elif pricing_type == "paid":
        ways["free"] = None
        ways["buy"] = {
            "price": price if price is not None else (current["buy"] or {}).get("price"),
            "window": buy_window,
        }
    elif pricing_type == "subscription":
        if not current["plans"]:
            raise WaysError("plan", _("Pick a subscription first, then include this in it."))
        ways["free"] = ways["buy"] = None
    elif price is not None:
        amount = _amount(price)
        if amount < 0:
            raise WaysError("price", _("Add a price above 0."))
        if amount > 0:
            ways["buy"] = {"price": price, "window": buy_window}
        else:
            ways["buy"] = None
            if not ways["plans"] and not ways["free"]:
                ways["free"] = {"window": None}
    else:
        return current
    return set_ways(item, ways, actor=actor)


# ---- stamping ----------------------------------------------------------------


def _tenant_zone() -> ZoneInfo:
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first()
    return ZoneInfo((config.timezone if config else None) or "UTC")


def window_bounds(
    window: dict | None, anchor: datetime, zone: ZoneInfo | None = None
) -> tuple[datetime, datetime | None]:
    """When a window opens and closes for someone who joined at ``anchor``; calendar dates are the creator's days.

    ``zone`` is the creator's time zone; a caller bounding many windows looks it up once and passes it in.
    """
    w = window or {}
    zone = zone or _tenant_zone()
    start, end = anchor, None
    if "opens_after_days" in w:
        start = anchor + timedelta(days=w["opens_after_days"])
    elif "opens_on" in w:
        midnight = datetime.combine(date.fromisoformat(w["opens_on"]), time.min, tzinfo=zone)
        start = max(anchor, midnight.astimezone(UTC))
    if "closes_after_days" in w:
        end = anchor + timedelta(days=w["closes_after_days"])
    elif "closes_on" in w:
        end = datetime.combine(date.fromisoformat(w["closes_on"]), time(23, 59, 59), tzinfo=zone).astimezone(UTC)
    return start, end


def stamp(item, paid_at: datetime) -> tuple[datetime, datetime | None]:
    """The window a purchase of ``item`` made at ``paid_at`` keeps: the item's buy window as it is now."""
    buy = ways_of(item)["buy"]
    return window_bounds(buy["window"] if buy else None, paid_at)


# ---- plain words -------------------------------------------------------------


def span_text(days: int) -> str:
    for size, unit in ((365, "year"), (30, "month"), (7, "week"), (1, "day")):
        if days % size == 0:
            n = days // size
            if unit == "year":
                return ngettext("%(n)d year", "%(n)d years", n) % {"n": n}
            if unit == "month":
                return ngettext("%(n)d month", "%(n)d months", n) % {"n": n}
            if unit == "week":
                return ngettext("%(n)d week", "%(n)d weeks", n) % {"n": n}
            return ngettext("%(n)d day", "%(n)d days", n) % {"n": n}


def _day(value: str) -> str:
    return date_format(date.fromisoformat(value), "j M Y")


def _clauses(window: dict | None, opens_after: str, closes_after: str, closes_until: str) -> list[str]:
    """The window as phrases; the templates (already translated) take a ``%(span)s`` such as "1 month". A span
    to the close still counts from when they got in, so once an opening is set it reads ``closes_until``,
    not a length."""
    w = window or {}
    out = []
    if "opens_after_days" in w:
        out.append(opens_after % {"span": span_text(w["opens_after_days"])})
    if "opens_on" in w:
        out.append(_("from %(date)s") % {"date": _day(w["opens_on"])})
    if "closes_after_days" in w:
        opens = "opens_after_days" in w or "opens_on" in w
        out.append((closes_until if opens else closes_after) % {"span": span_text(w["closes_after_days"])})
    if "closes_on" in w:
        out.append(_("until %(date)s") % {"date": _day(w["closes_on"])})
    return out


def membership_text(link) -> str:
    """A plan link's window as the Access section's pill says it (``linkPill``): "<opens> · <closes>"."""
    w = _window_of(link) or {}
    if "opens_after_days" in w:
        opens = _("After %(span)s of membership") % {"span": span_text(w["opens_after_days"])}
    elif "opens_on" in w:
        opens = _("From %(date)s") % {"date": _day(w["opens_on"])}
    else:
        opens = _("Right away")
    if "closes_after_days" in w:
        closes = _("closes after %(span)s") % {"span": span_text(w["closes_after_days"])}
    elif "closes_on" in w:
        closes = _("closes %(date)s") % {"date": _day(w["closes_on"])}
    else:
        closes = _("never closes")
    return f"{opens} · {closes}"


def describe(ways: dict) -> str:
    """The ways in as one sentence for the creator (and the copilot's cards and digests)."""
    from apps.tenant_config.interview_brief import money

    parts = []
    if ways.get("free"):
        clauses = _clauses(
            ways["free"].get("window"),
            _("after %(span)s of joining"),
            _("for %(span)s after joining"),
            _("until %(span)s after joining"),
        )
        parts.append(" ".join([_("Free"), *clauses]) if clauses else _("Free for everyone"))
    if ways.get("buy"):
        buy = ways["buy"]
        clauses = _clauses(
            buy.get("window"),
            _("opening %(span)s after purchase"),
            _("with %(span)s of access"),
            _("until %(span)s after purchase"),
        )
        once = _("%(price)s once") % {"price": money(buy["price"])}
        parts.append(once + (" " + ", ".join(clauses) if clauses else _(", theirs to keep")))
    if ways.get("plans"):
        ids = [p["plan_id"] for p in ways["plans"]]
        names = dict(SubscriptionPlan.objects.filter(pk__in=ids).values_list("pk", "name"))
        groups: dict[tuple, list[str]] = {}
        for p in ways["plans"]:
            if p["plan_id"] not in names:
                raise WaysError("plan", _("One of those subscriptions no longer exists."))
            clauses = tuple(
                _clauses(
                    p.get("window"),
                    _("after %(span)s of membership"),
                    _("for %(span)s of membership"),
                    _("until %(span)s into membership"),
                )
            )
            groups.setdefault(clauses, []).append(names[p["plan_id"]])
        parts.append(
            ", ".join(
                _("in %(plans)s") % {"plans": get_text_list(n, _("and"))} + "".join(f" {c}" for c in cl)
                for cl, n in groups.items()
            )
        )
    text = "; ".join(parts)
    return f"{text[:1].upper()}{text[1:]}."


# ---- item serializers --------------------------------------------------------


class ShorthandMixin:
    """For an item's create/update serializer: ``pricing_type`` and ``price`` stay accepted as a shorthand,
    written through ``apply_shorthand`` after the save. A refused change is a 400 and rolls the save back."""

    def save(self, **kwargs):
        from rest_framework import serializers

        sent = {key: self.validated_data[key] for key in ("pricing_type", "price") if key in self.validated_data}
        # A form that echoes the stored values back changes nothing: re-applying "free" or "paid" would drop a window.
        if self.instance is not None:
            sent = {
                key: value
                for key, value in sent.items()
                if (
                    Decimal(str(value or 0)) != Decimal(self.instance.price or 0)
                    if key == "price"
                    else value != getattr(self.instance, key)
                )
            }
        with transaction.atomic():
            instance = super().save(**kwargs)
            if sent:
                request = self.context.get("request")
                try:
                    apply_shorthand(instance, actor=getattr(request, "user", None), **sent)
                except WaysError as error:
                    field = "pricing_type" if error.code in ("plan", "not_allowed") else "price"
                    raise serializers.ValidationError({field: str(error)}) from error
        return instance


# ---- migration ---------------------------------------------------------------


def link_unlinked_members_only(get_model=None) -> int:
    """Link every members-only item that names no plan to every active plan, so closing the
    "any active subscription" rule changes nobody's access. Returns how many items were linked.

    ``get_model`` is where the models come from: ``apps.get_model`` inside a migration (the historical
    models, so a later column never breaks it); the live models by default.
    """
    get_model = get_model or apps.get_model
    plans = list(get_model("billing", "SubscriptionPlan").objects.filter(is_active=True))
    if not plans:
        return 0
    access, content_type = get_model("billing", "SubscriptionPlanAccess"), get_model("contenttypes", "ContentType")
    linked = 0
    for kind, label in KINDS.items():
        if kind == "bundle":
            continue
        app_label, model_name = label.split(".")
        model = get_model(app_label, model_name)
        ctype, _ = content_type.objects.get_or_create(app_label=app_label, model=model_name)
        has_link = access.objects.filter(content_type=ctype).values("object_id")
        for item in model.objects.filter(pricing_type="subscription").exclude(pk__in=has_link):
            access.objects.bulk_create([access(plan=plan, content_type=ctype, object_id=item.pk) for plan in plans])
            linked += 1
    return linked
