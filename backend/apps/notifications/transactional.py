"""The emails a coach's students get because of something they did or that happened to what they
have: a sign-in link, a welcome, receipts, membership changes, refunds, class reminders and
changes, a reply to their post, her announcements.

They all wear the one email style she picked in /setup (``answers["email_style"]``) in her look's
colours, fonts and mark. The email engine (apps.email_campaigns.render) draws each send from the block
JSON built here, with every value already in place. Should it fail, the same words go out as a plain
email in her colours: a sign-in link never waits on it.
"""

import functools
import hashlib
import itertools
import logging
import re
from dataclasses import asdict, dataclass

from django.core.cache import cache
from django.db import connection, transaction
from django.utils.formats import date_format, number_format
from django.utils.html import escape
from django.utils.translation import gettext as _
from django.utils.translation import ngettext

from apps.core.languages import in_site_language, site_language, site_language_context

logger = logging.getLogger(__name__)

STYLES = (
    ("letter", "Letter", "Quiet and personal, like a note from you. Your name on top, words first."),
    ("branded", "Branded", "Your mark on top over a band of your colour, the message on a clean card."),
    ("bold", "Bold", "Big headline on your colour, a full-width button. Hard to miss."),
)
STYLE_IDS = {s for s, _, _ in STYLES}
DEFAULT_STYLE = "branded"
PREVIEW_SECONDS = 3600
_SIGNED_AT = re.compile(r"(/api/v1/email/i/[^/:]+):[^/]+/")  # a lasting link's signing time and signature


@dataclass(frozen=True)
class Email:
    subject: str
    heading: str
    lines: tuple = ()  # paragraphs, plain text
    button: str = ""
    link: str = ""
    rows: tuple = ()  # (label, value) pairs: a receipt's lines
    code: str = ""  # the sign-in code, set large
    note: str = ""  # small print under the button
    body_html: str = ""  # an announcement's own text, already sanitized
    unsubscribe: str = ""  # set on emails a student may turn off


# --- her brand -------------------------------------------------------------------------------


def style_of(tenant) -> str:
    from apps.tenant_config.interview_brief import answers_of

    picked = answers_of(tenant).get("email_style")
    return picked if picked in STYLE_IDS else DEFAULT_STYLE


def brand_kit(tenant, cfg) -> dict:
    """Her name, site, mark and look as email-safe values (the email engine's brand kit, in the names
    this module's blocks use)."""
    from apps.email_campaigns import brand

    kit = brand.kit(tenant, cfg)
    return {
        "name": kit["name"],
        "site": kit["site"],
        "host": kit["host"],
        # Her square mark (or her initial on her colour), served by her own site.
        "logo": kit["mark"],
        "colours": {**kit["colors"], "mutedForeground": kit["colors"]["muted"]},
        "heading_font": kit["fonts"]["heading"],
        "body_font": kit["fonts"]["body"],
        "radius": kit["radius"],
        "kit": kit,
    }


# --- block JSON ---------------------------------------------------------------------------------


def _pad(top, side, bottom):
    return {"top": top, "right": side, "bottom": bottom, "left": side}


def _paragraphs(lines, colour) -> str:
    return "".join(f'<p style="color:{colour};">{escape(line)}</p>' for line in lines if line)


def blocks(kit: dict, style: str, email: Email, *, picture=("", ""), offer=None) -> dict:
    """The email as block JSON (apps.email_campaigns.render) in one of the three styles. ``picture``
    (src, alt) and ``offer`` (a catalog item) fill out the setup samples; the emails sent carry neither."""
    from apps.email_campaigns.images import with_aspect

    ids = itertools.count(1)
    c = kit["colours"]
    hf, bf = kit["heading_font"], kit["body_font"]

    def block(kind, data, style_):
        return {"id": f"t{next(ids)}", "type": kind, "data": data, "style": style_}

    def image(src, alt, full):
        return block(
            "image",
            {"src": with_aspect(src, "16:9"), "alt": alt, "width": 600 if full else 600 - 2 * side},
            {
                "padding": _pad(8, 0 if full else side, 8),
                "alignment": "center",
                "fullWidth": full,
                "borderRadius": 0 if full else kit["radius"],
            },
        )

    def heading(text, size, colour, pad, align="left", font=hf, **extra):
        return block(
            "heading",
            {"text": text, "level": 2 if size >= 22 else 3},
            {"padding": pad, "alignment": align, "color": colour, "fontSize": size, "fontFamily": font, **extra},
        )

    def text(html, colour, pad, size=16, align="left"):
        return block(
            "text",
            {"html": html, "variables": []},
            {"padding": pad, "alignment": align, "color": colour, "fontSize": size},
        )

    def band(children, bg, pad):
        column = {"id": f"t{next(ids)}", "backgroundColor": bg, "padding": pad, "blocks": children}
        return block(
            "columns", {"columnCount": 1, "columnRatio": [100], "columns": [column]}, {"padding": _pad(0, 0, 0)}
        )

    def row(label, value):
        cells = [
            {
                "id": f"t{next(ids)}",
                "padding": {"top": 0, "right": 0, "bottom": 0, "left": 40},
                "blocks": [text(f"<p>{escape(label)}</p>", c["mutedForeground"], _pad(4, 0, 4), 15)],
            },
            {
                "id": f"t{next(ids)}",
                "padding": {"top": 0, "right": 40, "bottom": 0, "left": 0},
                "blocks": [
                    text(f"<p><strong>{escape(value)}</strong></p>", c["foreground"], _pad(4, 0, 4), 15, "right")
                ],
            },
        ]
        return block(
            "columns",
            {"columnCount": 2, "columnRatio": [60, 40], "columns": cells},
            {"gap": 0, "stackOnMobile": False},
        )

    side = 40
    body_bg = c["background"]
    head_size = 34 if style == "bold" else 26
    header, body, footer = [], [], []

    if style == "letter":
        page_bg = c["background"]
        header.append(
            heading(
                kit["name"], 15, c["mutedForeground"], _pad(40, side, 8), letterSpacing=2, textTransform="uppercase"
            )
        )
        body.append(heading(email.heading, head_size, c["foreground"], _pad(16, side, 12)))
    elif style == "bold":
        page_bg = c["inverse"]
        header.append(
            band(
                [
                    heading(
                        kit["name"],
                        13,
                        c["primaryForeground"],
                        _pad(0, 0, 18),
                        "left",
                        bf,
                        letterSpacing=3,
                        textTransform="uppercase",
                    ),
                    heading(email.heading, head_size, c["primaryForeground"], _pad(0, 0, 0)),
                ],
                c["primary"],
                _pad(36, side, 40),
            )
        )
    else:  # branded
        page_bg = c["surface"]
        # Her logo (her mark when she has none) on her page colour, where any mark shows, then a band
        # of her colour beneath it.
        header.append(
            block(
                "brandHeader",
                {"variant": "logo"},
                {"padding": _pad(28, side, 22), "alignment": "center", "color": c["foreground"], "logoHeight": 56},
            )
        )
        header.append(block("spacer", {}, {"height": 6, "backgroundColor": c["primary"]}))
        body.append(heading(email.heading, head_size, c["foreground"], _pad(36, side, 12)))

    top = 28 if style == "bold" else 4
    align = "left" if style == "letter" else "center"
    if email.lines:
        body.append(text(_paragraphs(email.lines, c["foreground"]), c["foreground"], _pad(top, side, 8)))
        top = 8
    if email.body_html:
        body.append(text(email.body_html, c["foreground"], _pad(top, side, 8)))
    if picture[0]:
        # Words first in a letter; in the others her picture opens the message, edge to edge.
        body.insert(len(body) if style == "letter" else 0, image(*picture, full=style != "letter"))
    if email.rows:
        body.append(block("divider", {}, {"lineColor": c["border"], "spacing": 12}))
        body.extend(row(label, value) for label, value in email.rows)
        body.append(block("divider", {}, {"lineColor": c["border"], "spacing": 12}))
    if email.code:
        body.append(heading(email.code, 30, c["foreground"], _pad(12, side, 8), align, bf, letterSpacing=6))
    if email.button and email.link:
        bold = style == "bold"
        body.append(
            block(
                "button",
                {"text": email.button, "url": email.link},
                {
                    "padding": _pad(20, side, 20),
                    "alignment": align,
                    "backgroundColor": c["accent"] if bold else c["primary"],
                    "color": c["accentForeground"] if bold else c["primaryForeground"],
                    "borderRadius": 0 if bold else (999 if style == "branded" else kit["radius"]),
                    "fullWidth": bold,
                    "fontFamily": bf,
                    "fontSize": 16,
                    "fontWeight": 600,
                    "paddingX": 28,
                    "paddingY": 14,
                },
            )
        )
    if offer:
        body.append(
            block(
                "item",
                {"_item": offer, "layout": "row", "showSummary": False, "buttonText": _("Take a look")},
                {
                    "padding": _pad(12, side, 12),
                    "backgroundColor": c["surface"],
                    "borderRadius": 0 if style == "bold" else 14,
                    "titleColor": c["foreground"],
                    "textColor": c["mutedForeground"],
                    "buttonColor": c["primary"],
                    "buttonTextColor": c["primaryForeground"],
                },
            )
        )
    if email.note:
        body.append(text(f"<p>{escape(email.note)}</p>", c["mutedForeground"], _pad(4, side, 28), 13))
    else:
        body.append(block("spacer", {}, {"height": 20}))

    small = f'<a href="{escape(kit["site"])}">{escape(kit["host"])}</a>'
    if email.unsubscribe:
        small += f' · <a href="{escape(email.unsubscribe)}">{escape(_("Unsubscribe"))}</a>'
    if style == "letter":
        footer.append(block("divider", {}, {"lineColor": c["border"], "spacing": 8}))
        footer.append(text(f"<p>{escape(kit['name'])}</p><p>{small}</p>", c["mutedForeground"], _pad(8, side, 40), 13))
    elif style == "bold":
        footer.append(
            band(
                [text(f"<p>{escape(kit['name'])} · {small}</p>", c["inverseForeground"], _pad(0, 0, 0), 13)],
                c["inverse"],
                _pad(24, side, 32),
            )
        )
    else:
        footer.append(
            text(f"<p>{escape(kit['name'])} · {small}</p>", c["mutedForeground"], _pad(24, side, 32), 13, "center")
        )

    return {
        "version": 1,
        "settings": {
            "backgroundColor": page_bg,
            "backgroundStyle": "none",
            "bodyBackgroundStyle": "solid",
            "bodyBackgroundColor": body_bg,
            "bodyBorderRadius": 12 if style == "branded" else 0,
            "contentWidth": 600,
            "defaultFont": bf,
            "defaultFontSize": 16,
            "defaultColor": c["foreground"],
            "version": 1,
        },
        "header": {"blocks": header},
        "body": {"blocks": body},
        "footer": {"blocks": footer},
    }


def fallback_html(kit: dict, email: Email) -> str:
    """The same email, plain, in her colours: what goes out should the engine ever fail."""
    c = kit["colours"]
    muted, line = c["mutedForeground"], f"1px solid {c['border']}"
    parts = [
        f'<p style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:{muted}">'
        f"{escape(kit['name'])}</p>",
        f'<h2 style="font-family:{kit["heading_font"]};margin:0 0 12px">{escape(email.heading)}</h2>',
        _paragraphs(email.lines, c["foreground"]),
        email.body_html,
    ]
    if email.rows:
        cells = "".join(
            f'<tr><td style="padding:4px 0;color:{muted}">{escape(k)}</td>'
            f'<td style="padding:4px 0;text-align:right"><strong>{escape(v)}</strong></td></tr>'
            for k, v in email.rows
        )
        parts.append(
            f'<table role="presentation" width="100%" style="border-top:{line};border-bottom:{line};margin:16px 0">'
            f"{cells}</table>"
        )
    if email.code:
        parts.append(f'<p style="font-size:28px;font-weight:700;letter-spacing:6px">{escape(email.code)}</p>')
    if email.button and email.link:
        button = f"background:{c['primary']};color:{c['primaryForeground']};padding:12px 28px;border-radius:999px"
        parts.append(
            f'<p><a href="{escape(email.link)}" style="display:inline-block;{button};text-decoration:none;'
            f'font-weight:600">{escape(email.button)}</a></p>'
        )
    if email.note:
        parts.append(f'<p style="font-size:13px;color:{muted}">{escape(email.note)}</p>')
    unsub = f' · <a href="{escape(email.unsubscribe)}">{escape(_("Unsubscribe"))}</a>' if email.unsubscribe else ""
    parts.append(
        f'<p style="font-size:12px;color:{muted};margin-top:32px">'
        f"{escape(kit['name'])} · {escape(kit['host'])}{unsub}</p>"
    )
    return (
        f'<div style="font-family:{kit["body_font"]};font-size:16px;line-height:1.5;color:{c["foreground"]};'
        f'max-width:520px;margin:0 auto;padding:32px 20px">{"".join(parts)}</div>'
    )


def plain_text(email: Email) -> str:
    out = [email.heading, "", *email.lines]
    out += [f"{k}: {v}" for k, v in email.rows]
    if email.code:
        out += ["", email.code]
    if email.button and email.link:
        out += ["", f"{email.button}: {email.link}"]
    if email.note:
        out += ["", email.note]
    if email.unsubscribe:
        out += ["", f"{_('Unsubscribe')}: {email.unsubscribe}"]
    return "\n".join(out) + "\n"


# --- rendering and sending -------------------------------------------------------------------


def _config():
    from apps.tenant_config.models import TenantConfig

    return TenantConfig.objects.first()


def render(email: Email, tenant, *, style: str = "", cfg=None, picture=("", ""), offer=None) -> str:
    """Her email's HTML, drawn by the email engine; the plain one should it ever fail."""
    from apps.email_campaigns import render as engine

    cfg = cfg or _config()
    kit = brand_kit(tenant, cfg)
    try:
        design = blocks(kit, style or style_of(tenant), email, picture=picture, offer=offer)
        return engine.render(design, kit=kit["kit"], subject=email.subject)
    except Exception:  # noqa: BLE001 — never blocks the email
        logger.exception("email engine failed for %s; sending the plain email", tenant.schema_name)
        return fallback_html(kit, email)


@in_site_language
def send(to: str, email: Email, tenant, *, html: str = "") -> bool:
    from apps.core.email import send_email
    from apps.mailbox.identity import sending_identity

    if email.unsubscribe:
        from apps.notifications.models import EmailOptOut

        if EmailOptOut.objects.filter(email=to.lower()).exists():
            return False
    cfg = _config()
    html = html or render(email, tenant, cfg=cfg)
    headers = (
        {"List-Unsubscribe": f"<{email.unsubscribe}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
        if email.unsubscribe
        else None
    )
    return send_email(
        to=to,
        subject=email.subject,
        html=html,
        text=plain_text(email),
        from_name=(cfg.brand_name if cfg else "") or tenant.name,
        from_email=sending_identity(tenant)[0],
        headers=headers,
    )


def deliver(to: str, email: Email) -> None:
    """Send in the background once the current transaction commits (a webhook's, a view's)."""
    if not to:
        return
    from .tasks import send_transactional

    schema, payload = connection.schema_name, asdict(email)
    transaction.on_commit(lambda: send_transactional.delay(schema, to, payload))


@in_site_language
def previews(tenant) -> list[dict]:
    """The three styles with a sample email in each, for the setup question: her welcome with her photo
    and one of her offers, so each card shows a whole email. Cached: the screen re-opens, and her look,
    name, photo or offer changing makes a new key."""
    from apps.email_campaigns.starters import _site_photo

    cfg = _config()
    kit = brand_kit(tenant, cfg)
    sample = welcome(kit["name"], kit["site"], _pitch(tenant))
    picture, offer = _site_photo(tenant, cfg), _offer(tenant, cfg)
    # A lasting picture link is signed again every second: what it points at names it, not when.
    inputs = _SIGNED_AT.sub(r"\1/", repr((kit, sample, picture, offer)))
    key = f"tx-previews:{tenant.schema_name}:{site_language()}:{hashlib.sha256(inputs.encode()).hexdigest()}"
    cached = cache.get(key)
    if cached is None:
        cached = [
            {
                "value": sid,
                "label": label,
                "detail": detail,
                "html": render(sample, tenant, style=sid, cfg=cfg, picture=picture, offer=offer),
            }
            for sid, label, detail in STYLES
        ]
        cache.set(key, cached, PREVIEW_SECONDS)
    return cached


def here() -> tuple[str, str]:
    """Her brand name and site, for the tenant this request or task runs in."""
    from apps.notifications.email_render import tenant_base_url

    cfg, tenant = _config(), connection.tenant
    return (cfg.brand_name if cfg else "") or tenant.name, tenant_base_url(tenant)


def _quiet(hook):
    """An email hook never breaks what triggered it (a webhook, a login, a delete): building the
    email fails, the error is logged and the payment or change goes on."""

    @functools.wraps(hook)
    def run(*args, **kwargs):
        try:
            with site_language_context():
                hook(*args, **kwargs)
        except Exception:  # noqa: BLE001
            logger.exception("transactional email %s failed", hook.__name__)

    return run


@_quiet
def welcome_student(to: str) -> None:
    brand, site = here()
    deliver(to, welcome(brand, site, _pitch(connection.tenant)))


def email_of(user_id) -> str:
    from apps.accounts.models import User

    return User.objects.filter(pk=user_id).values_list("email", flat=True).first() or ""


def _title(obj) -> str:
    return str(getattr(obj, "title", "") or getattr(obj, "name", "") or obj)


def _lines(payment, items) -> list:
    return [(_title(i.content_object), money(i.item_price, payment.currency)) for i in items if i.content_object]


@_quiet
def purchase_done(payment) -> None:
    """A one-time purchase was paid: her receipt, with how long it is hers when that ends."""
    brand, site = here()
    items = list(payment.items.all())
    ends = [i.access_ends_at for i in items if i.access_ends_at]
    receipt = (payment.metadata or {}).get("receipt_url", "")
    total = money(payment.amount, payment.currency)
    deliver(
        email_of(payment.student_id),
        purchase(brand, site, _lines(payment, items), total, receipt, day(min(ends)) if ends else ""),
    )


@_quiet
def refund_done(payment, items, refunded) -> None:
    brand, site = here()
    deliver(
        email_of(payment.student_id),
        refund(brand, site, _lines(payment, items), money(refunded.amount, refunded.currency)),
    )


@_quiet
def access_opened(to: str, title: str, until=None) -> None:
    brand, site = here()
    deliver(to, access_given(brand, site, title, day(until) if until else ""))


def ticket_holders(event) -> list[str]:
    """Who bought a place at this class or event (and wasn't refunded). Free classes and the
    ones members join stay on push: a weekly class would mean a weekly email to everyone.
    ponytail: a ticket bought inside a bundle isn't found here; join through BundleItem if that matters."""
    from django.contrib.contenttypes.models import ContentType

    from apps.accounts.models import User
    from apps.billing.models import PaymentItem

    ids = PaymentItem.objects.filter(
        content_type=ContentType.objects.get_for_model(event),
        object_id=event.pk,
        is_refunded=False,
        payment__status__in=("completed", "partially_refunded"),
    ).values_list("payment__student_id", flat=True)
    return list(User.objects.filter(pk__in=ids).values_list("email", flat=True).distinct())


def event_link(event, site: str) -> str:
    paths = {"LiveClass": f"/live/{event.pk}", "LiveStream": f"/live-stream/{event.pk}", "ZoomClass": "/live-classes"}
    return site + paths.get(type(event).__name__, "/events")


@_quiet
def class_event(kind: str, event) -> None:
    """reminder | changed | cancelled, to everyone holding a ticket. Call before a delete."""
    holders = ticket_holders(event)
    if not holders or not event.scheduled_at:
        return
    brand, site = here()
    at = when(event.scheduled_at)
    email = {
        "reminder": lambda: class_reminder(event.title, at, event_link(event, site)),
        "changed": lambda: class_changed(event.title, at, event_link(event, site)),
        "cancelled": lambda: class_cancelled(brand, site, event.title, at),
    }[kind]()
    for to in holders:
        deliver(to, email)


@_quiet
def comment_replied(comment) -> None:
    """Someone else commented on her post. She can turn these off (the unsubscribe link)."""
    from apps.notifications.email_render import unsubscribe_url

    to = comment.post.author.user.email
    _brand, site = here()

    def short(text):
        flat = " ".join(str(text or "").split())
        return flat if len(flat) <= 160 else flat[:157] + "…"

    unsub = unsubscribe_url(connection.tenant, user_id=comment.post.author.user_id, email=to)
    deliver(
        to,
        comment_reply(
            short(comment.post.body), comment.author.display_name, short(comment.body), f"{site}/community", unsub
        ),
    )


ENDING_DAYS = 3


@in_site_language
def access_ending_soon() -> None:
    """Access with an end date (a coach's grant for N days, a purchase with a time limit) ending
    in about ENDING_DAYS days. Run daily: each run covers the next day-wide slice, and a key per
    row and end date keeps a second run that day from repeating it."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.billing.models import PaymentItem
    from apps.courses.models import Enrollment

    now = timezone.now()
    window = {
        "access_ends_at__gt": now + timedelta(days=ENDING_DAYS - 1),
        "access_ends_at__lte": now + timedelta(days=ENDING_DAYS),
    }
    rows = [
        (e.user.email, e.course.title, e.access_ends_at, f"enrollment:{e.pk}")
        for e in Enrollment.objects.filter(is_active=True, **window).select_related("user", "course")
    ]
    rows += [
        (email_of(i.payment.student_id), _title(i.content_object), i.access_ends_at, f"item:{i.pk}")
        for i in PaymentItem.objects.filter(
            is_refunded=False, payment__status__in=("completed", "partially_refunded"), **window
        ).select_related("payment")
        if i.content_object
    ]
    if not rows:
        return
    brand, site = here()
    for to, title, ends, key in rows:
        if cache.add(f"tx-ending:{connection.schema_name}:{key}:{ends:%Y%m%d}", 1, 7 * 86400):
            deliver(to, access_ending(brand, site, title, day(ends)))


def _per(sub) -> str:
    months = sub.plan.billing_interval_months or 1
    price = {"price": money(sub.billing_amount, sub.billing_currency)}
    if months == 1:
        return _("%(price)s / month") % price
    if months == 12:
        return _("%(price)s / year") % price
    return ngettext("%(price)s / %(count)d month", "%(price)s / %(count)d months", months) % {**price, "count": months}


@_quiet
def membership_event(kind: str, sub, invoice_url: str = "", amount=None, currency: str = "") -> None:
    """started | renewed | failed | cancelled | ended, for one membership. ``amount`` is the raw sum (what a
    renewal took, what failed): it is written here, in the site's language, never by the caller."""
    brand, site = here()
    plan, end = sub.plan.name, day(sub.current_period_end)
    amount = money(amount, currency or sub.billing_currency) if amount is not None else ""
    email = {
        "started": lambda: membership_started(brand, site, plan, _per(sub), end),
        "renewed": lambda: membership_renewed(brand, site, plan, amount, end, invoice_url),
        "failed": lambda: payment_failed(brand, site, plan, amount, invoice_url),
        "cancelled": lambda: membership_cancelled(brand, site, plan, end),
        "ended": lambda: membership_ended(brand, site, plan),
    }[kind]()
    deliver(email_of(sub.student_id), email)


def _pitch(tenant) -> str:
    from apps.tenant_config.interview_brief import answers_of

    return str(answers_of(tenant).get("pitch") or "")[:200]


def _offer(tenant, cfg) -> dict | None:
    """The offer her setup samples feature: her newest course (a draft too: /setup's course waits for
    go-live), else her next class or event; None when she has neither."""
    from apps.courses.models import Course
    from apps.email_campaigns import catalog

    course = Course.objects.select_related("thumbnail").order_by("-created_at").first()
    if course is not None:
        return catalog._course(course, catalog.site_of(tenant))
    return catalog.find(["next:event"], tenant, cfg).get("next:event")


# --- the emails ------------------------------------------------------------------------------


class TenantConfigDefaults:
    """Stands in for a missing config: UTC."""

    timezone = "UTC"


def money(amount, currency: str) -> str:
    value = round(float(amount), 2)
    return f"{number_format(value, decimal_pos=0 if value == int(value) else 2)} {str(currency or '').upper()}"


def when(moment) -> str:
    """ "Tuesday 5 November 2030, 18:00 (Europe/Berlin)": at her clock, named."""
    from apps.email_campaigns.catalog import when as at_clock
    from apps.email_campaigns.catalog import zone_of

    return at_clock(moment, zone_of(_config() or TenantConfigDefaults))


def day(moment) -> str:
    from apps.email_campaigns.catalog import zone_of

    return date_format(moment.astimezone(zone_of(_config() or TenantConfigDefaults)), "j E Y")


@in_site_language
def sign_in(brand: str, link: str, code: str, minutes: int) -> Email:
    return Email(
        subject=_("Your sign-in link for %(brand)s") % {"brand": brand},
        heading=_("Sign in"),
        lines=(
            ngettext(
                "Tap the button to sign in to %(brand)s. The link works for %(minutes)d minute.",
                "Tap the button to sign in to %(brand)s. The link works for %(minutes)d minutes.",
                minutes,
            )
            % {"brand": brand, "minutes": minutes},
        ),
        button=_("Sign in"),
        link=link,
        code=f"{code[:3]} {code[3:]}" if code else "",
        note=" ".join(
            (
                *((_("Using the app? Enter the code above on the sign-in screen."),) if code else ()),
                _("If you didn't ask for this, you can ignore this email."),
            )
        ),
    )


def welcome(brand: str, site: str, pitch: str = "") -> Email:
    return Email(
        subject=_("Welcome to %(brand)s") % {"brand": brand},
        heading=_("Welcome to %(brand)s") % {"brand": brand},
        lines=tuple(
            x
            for x in (pitch, _("Your account is ready. Everything you join or buy waits for you in your dashboard."))
            if x
        ),
        button=_("Go to your dashboard"),
        link=f"{site}/dashboard",
    )


def purchase(brand: str, site: str, items: list, total: str, receipt_url: str = "", access_until: str = "") -> Email:
    rows = [*items, (_("Total"), total)]
    if access_until:
        rows.append((_("Yours until"), access_until))
    return Email(
        subject=_("Your order from %(brand)s") % {"brand": brand},
        heading=_("Thank you for your order"),
        lines=(_("Payment received. It's all ready for you."),),
        rows=tuple(rows),
        button=_("Open your dashboard"),
        link=f"{site}/dashboard",
        note=(
            _("Your receipt: %(url)s") % {"url": receipt_url}
            if receipt_url
            else _("Your orders are listed under Orders in your account.")
        ),
    )


def access_given(brand: str, site: str, title: str, until: str = "") -> Email:
    return Email(
        subject=_("You're in: %(title)s") % {"title": title},
        heading=_("You're in: %(title)s") % {"title": title},
        lines=(
            _("%(title)s from %(brand)s is now in your dashboard.") % {"title": title, "brand": brand},
            _("It's yours until %(until)s.") % {"until": until} if until else "",
        ),
        button=_("Start now"),
        link=f"{site}/dashboard",
    )


def membership_started(brand: str, site: str, plan: str, price: str, renews: str) -> Email:
    return Email(
        subject=_("Welcome to %(plan)s") % {"plan": plan},
        heading=_("Welcome to %(plan)s") % {"plan": plan},
        lines=(
            _("Your %(brand)s membership is active. Everything it includes is open to you now.") % {"brand": brand},
        ),
        rows=((_("Membership"), plan), (_("Price"), price), (_("Renews on"), renews)),
        button=_("Open your dashboard"),
        link=f"{site}/dashboard",
        note=_("Manage or cancel it any time under Subscriptions in your account."),
    )


def membership_renewed(brand: str, site: str, plan: str, amount: str, next_on: str, invoice_url: str = "") -> Email:
    return Email(
        subject=_("%(plan)s: payment received") % {"plan": plan},
        heading=_("Your membership renewed"),
        lines=(_("Thanks for staying with %(brand)s.") % {"brand": brand},),
        rows=((_("Membership"), plan), (_("Paid"), amount), (_("Next renewal"), next_on)),
        button=_("View invoice") if invoice_url else _("Your subscriptions"),
        link=invoice_url or f"{site}/subscriptions",
    )


def payment_failed(brand: str, site: str, plan: str, amount: str, invoice_url: str = "") -> Email:
    return Email(
        subject=_("%(plan)s: your payment didn't go through") % {"plan": plan},
        heading=_("Your payment didn't go through"),
        lines=(
            _("We couldn't take %(amount)s for your %(plan)s membership with %(brand)s.")
            % {"amount": amount, "plan": plan, "brand": brand},
            _("Update your card to keep your access. Your bank will try again in a few days."),
        ),
        button=_("Update payment"),
        link=invoice_url or f"{site}/subscriptions",
    )


def membership_cancelled(brand: str, site: str, plan: str, until: str) -> Email:
    return Email(
        subject=_("%(plan)s is cancelled") % {"plan": plan},
        heading=_("Your membership is cancelled"),
        lines=(
            _("You keep everything in %(plan)s until %(until)s. After that it won't renew.")
            % {"plan": plan, "until": until},
            _("Changed your mind? You can restart it from your account before then."),
        ),
        button=_("Your subscriptions"),
        link=f"{site}/subscriptions",
    )


def membership_ended(brand: str, site: str, plan: str) -> Email:
    return Email(
        subject=_("Your %(plan)s membership has ended") % {"plan": plan},
        heading=_("Your membership has ended"),
        lines=(
            _("Your %(plan)s membership with %(brand)s has ended. You're welcome back any time.")
            % {"plan": plan, "brand": brand},
        ),
        button=_("See memberships"),
        link=f"{site}/plans",
    )


def refund(brand: str, site: str, items: list, amount: str) -> Email:
    return Email(
        subject=_("Your refund from %(brand)s") % {"brand": brand},
        heading=_("Your refund is on its way"),
        lines=(_("Your bank usually shows it within 5 to 10 days."),),
        rows=(*items, (_("Refunded"), amount)),
        button=_("Your orders"),
        link=f"{site}/orders",
    )


def access_ending(brand: str, site: str, title: str, ends: str) -> Email:
    return Email(
        subject=_("%(title)s: your access ends %(ends)s") % {"title": title, "ends": ends},
        heading=_("Your access ends soon"),
        lines=(
            _("Your access to %(title)s from %(brand)s ends on %(ends)s. Make the most of it.")
            % {"title": title, "brand": brand, "ends": ends},
        ),
        button=_("Continue"),
        link=f"{site}/dashboard",
    )


def class_reminder(title: str, at: str, link: str) -> Email:
    return Email(
        subject=_("Starting soon: %(title)s") % {"title": title},
        heading=_("%(title)s starts soon") % {"title": title},
        rows=((_("When"), at),),
        button=_("Join"),
        link=link,
    )


def class_changed(title: str, at: str, link: str) -> Email:
    return Email(
        subject=_("New time: %(title)s") % {"title": title},
        heading=_("%(title)s has a new time") % {"title": title},
        lines=(_("Your place is kept. Here's the new time:"),),
        rows=((_("When"), at),),
        button=_("See details"),
        link=link,
    )


def class_cancelled(brand: str, site: str, title: str, at: str) -> Email:
    return Email(
        subject=_("Cancelled: %(title)s") % {"title": title},
        heading=_("%(title)s is cancelled") % {"title": title},
        lines=(
            _("%(brand)s cancelled %(title)s on %(at)s. Sorry for the change.")
            % {"brand": brand, "title": title, "at": at},
            _("Questions about your ticket? Reply to this email."),
        ),
        button=_("See what's on"),
        link=f"{site}/events",
    )


def comment_reply(post: str, who: str, excerpt: str, link: str, unsubscribe: str) -> Email:
    return Email(
        subject=_("%(who)s replied to your post") % {"who": who},
        heading=_("%(who)s replied to your post") % {"who": who},
        lines=(_("On “%(post)s”:") % {"post": post}, f"“{excerpt}”"),
        button=_("Reply"),
        link=link,
        unsubscribe=unsubscribe,
    )
