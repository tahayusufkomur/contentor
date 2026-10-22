"""The email templates made for her at setup, from what she told the interview and what her site already
has: her brand header and footer in the email style she picked (letter, branded, bold), her own words, her
site's photos, and live slots for her newest course and next class. Colours and fonts are brand tokens, so a
new look later re-skins them. Deterministic: no AI, no paid images, instant.
"""

import itertools

from . import images
from .models import EmailTemplate, TemplateCategory, TemplateSource

SIDE = 40  # px of breathing room left and right of the body copy
STYLES = ("letter", "branded", "bold")
DEFAULT_STYLE = "branded"


class _Ids:
    def __init__(self):
        self._n = itertools.count(1)

    def __call__(self):
        return f"s{next(self._n)}"


def _pad(top, side=SIDE, bottom=None):
    return {"top": top, "right": side, "bottom": top if bottom is None else bottom, "left": side}


def _settings(style: str) -> dict:
    page = {"letter": "brand:background", "branded": "brand:surface", "bold": "brand:inverse"}[style]
    return {
        "backgroundColor": page,
        "bodyBackgroundColor": "brand:background",
        "contentWidth": 600,
        "bodyBorderRadius": 16 if style == "branded" else 0,
        "defaultFont": "brand:body",
        "defaultFontSize": 16,
        "defaultColor": "brand:foreground",
    }


def _header(style: str, ids) -> list[dict]:
    if style == "letter":
        return [
            {
                "id": ids(),
                "type": "brandHeader",
                "data": {"variant": "name"},
                "style": {"padding": _pad(36, SIDE, 4), "alignment": "left", "color": "brand:muted", "logoHeight": 40},
            }
        ]
    if style == "bold":
        return [
            {
                "id": ids(),
                "type": "brandHeader",
                "data": {"variant": "logoName"},
                "style": {
                    "padding": _pad(24, SIDE, 24),
                    "alignment": "left",
                    "backgroundColor": "brand:primary",
                    "color": "brand:primaryForeground",
                    "logoHeight": 40,
                },
            }
        ]
    return [
        {
            "id": ids(),
            "type": "brandHeader",
            "data": {"variant": "logo"},
            "style": {
                "padding": _pad(32, SIDE, 16),
                "alignment": "center",
                "color": "brand:foreground",
                "logoHeight": 56,
            },
        }
    ]


def _footer(style: str, ids) -> list[dict]:
    blocks = []
    if style == "letter":
        blocks.append(_divider(ids, "brand:border", 8))
    footer_style = {
        "letter": {"padding": _pad(16, SIDE, 40), "alignment": "left", "color": "brand:muted", "fontSize": 13},
        "branded": {"padding": _pad(24, SIDE, 36), "alignment": "center", "color": "brand:muted", "fontSize": 13},
        "bold": {
            "padding": _pad(28, SIDE, 36),
            "alignment": "center",
            "backgroundColor": "brand:inverse",
            "color": "brand:inverseForeground",
            "fontSize": 13,
        },
    }[style]
    blocks.append(
        {
            "id": ids(),
            "type": "brandFooter",
            "data": {"showSocial": True, "showAddress": True, "note": ""},
            "style": footer_style,
        }
    )
    return blocks


def _design(style, ids, body) -> dict:
    return {
        "version": 1,
        "settings": _settings(style),
        "header": {"blocks": _header(style, ids)},
        "body": {"blocks": body},
        "footer": {"blocks": _footer(style, ids)},
    }


def blank_design(style: str = DEFAULT_STYLE) -> dict:
    """Her brand's header and footer around an empty body: "Blank" in the editor."""
    style = style if style in STYLES else DEFAULT_STYLE
    return _design(style, _Ids(), [])


# ── blocks ─────────────────────────────────────────────────────────────────────────────────────


def _heading(ids, text, size=30, top=28, bottom=12, align="left", color="brand:foreground", **extra):
    return {
        "id": ids(),
        "type": "heading",
        "data": {"text": text, "level": 1 if size >= 28 else 2},
        "style": {
            "padding": _pad(top, SIDE, bottom),
            "alignment": align,
            "color": color,
            "fontSize": size,
            "fontFamily": "brand:heading",
            "fontWeight": 700,
            **extra,
        },
    }


def _text(ids, paragraphs, top=4, bottom=12, size=17, color="brand:foreground", align="left"):
    from django.utils.html import escape

    html = "".join(f"<p>{p if p.startswith('{{') else escape(p)}</p>" for p in paragraphs if p)
    return {
        "id": ids(),
        "type": "text",
        "data": {"html": html, "variables": []},
        "style": {"padding": _pad(top, SIDE, bottom), "alignment": align, "color": color, "fontSize": size},
    }


def _greeting_and(ids, *paragraphs, top=4):
    """ "Hi {{FirstName}}," then her paragraphs, as one text block."""
    from django.utils.html import escape

    html = "<p>Hi {{FirstName}},</p>" + "".join(f"<p>{escape(p)}</p>" for p in paragraphs if p)
    return {
        "id": ids(),
        "type": "text",
        "data": {"html": html, "variables": ["FirstName"]},
        "style": {"padding": _pad(top, SIDE, 12), "alignment": "left", "color": "brand:foreground", "fontSize": 17},
    }


def _button(ids, text, url, style: str, top=12, bottom=28, align="left"):
    return {
        "id": ids(),
        "type": "button",
        "data": {"text": text, "url": url},
        "style": {
            "padding": _pad(top, SIDE, bottom),
            "alignment": align,
            "backgroundColor": "brand:primary",
            "color": "brand:primaryForeground",
            "borderRadius": 999 if style == "branded" else (0 if style == "bold" else 6),
            "fullWidth": style == "bold",
            "fontFamily": "brand:body",
            "fontSize": 16,
            "fontWeight": 600,
            "paddingX": 28,
            "paddingY": 14,
        },
    }


def _divider(ids, color="brand:border", spacing=16):
    return {
        "id": ids(),
        "type": "divider",
        "data": {},
        "style": {"lineStyle": "solid", "lineColor": color, "lineThickness": 1, "spacing": spacing, "padding": _pad(0)},
    }


def _image(ids, src, alt, full=False):
    return {
        "id": ids(),
        "type": "image",
        "data": {"src": src, "alt": alt, "width": 600 if full else 520},
        "style": {
            "padding": _pad(8, 0 if full else SIDE, 8),
            "alignment": "center",
            "fullWidth": full,
            "borderRadius": 0 if full else 12,
        },
    }


def _item(ids, ref, button, layout="card", style="branded"):
    return {
        "id": ids(),
        "type": "item",
        "data": {
            "ref": ref,
            "layout": layout,
            "showImage": True,
            "showSummary": True,
            "showMeta": True,
            "buttonText": button,
        },
        "style": {
            "padding": _pad(12, SIDE, 12),
            "backgroundColor": "brand:surface",
            "borderRadius": 0 if style == "bold" else 14,
            "titleColor": "brand:foreground",
            "textColor": "brand:muted",
            "buttonColor": "brand:primary",
            "buttonTextColor": "brand:primaryForeground",
        },
    }


def _sign_off(ids, owner_name):
    first = (owner_name or "").split()[0] if owner_name else ""
    return _text(ids, ["Until soon,", first], top=8, bottom=28)


# ── what she told us ───────────────────────────────────────────────────────────────────────────


def _facts(tenant) -> dict:
    from apps.accounts.models import User
    from apps.tenant_config.interview_brief import answers_of

    from . import catalog

    answers = answers_of(tenant)
    cfg = catalog._config()
    owner = User.objects.filter(role="owner").order_by("pk").first()
    style = answers.get("email_style") if answers.get("email_style") in STYLES else DEFAULT_STYLE
    return {
        "brand": (cfg.brand_name if cfg else "") or tenant.name,
        "owner": (owner.name if owner else "") or "",
        "teaches": str(answers.get("teaches") or "").strip(),
        "pitch": str(answers.get("pitch") or "").strip(),
        "outcome": str(answers.get("outcome") or "").strip(),
        "offers": set(answers.get("offers") or []),
        "style": style,
        "photo": _site_photo(tenant, cfg),
    }


def _site_photo(tenant, cfg):
    """(src, alt) of a photo her site already shows (home page first), else one of her own; ("", "")."""
    from apps.media import own_photos
    from apps.media.models import Photo

    from . import catalog, images

    site = catalog.site_of(tenant)
    pages = (cfg.pages or {}) if cfg else {}
    for page in ("home", "about"):
        for block in (pages.get(page) or {}).get("blocks") or []:
            for value in block.values() if isinstance(block, dict) else ():
                if isinstance(value, dict) and value.get("photo_id"):
                    photo = Photo.objects.filter(pk=value["photo_id"]).first()
                    if photo is not None and photo.s3_key:
                        return images.stable_url_for(photo, site=site), value.get("alt") or photo.alt_text or ""
    mine = own_photos.own_photos().first()
    if mine is not None:
        return images.stable_url_for(mine, site=site), mine.alt_text or ""
    return "", ""


def _joined(answer: str) -> str:
    """ "More confidence, Less stress" -> "more confidence and less stress" (her tiles, as words)."""
    parts = [p.strip() for p in str(answer or "").split(",") if p.strip()]
    parts = [p[0].lower() + p[1:] for p in parts][:3]
    return f"{', '.join(parts[:-1])} and {parts[-1]}" if len(parts) > 1 else "".join(parts)


def _has(kind_qs) -> bool:
    try:
        return kind_qs.exists()
    except Exception:  # noqa: BLE001 — a missing table on a half-built site
        return False


# ── the four starters ──────────────────────────────────────────────────────────────────────────


def _newsletter(f) -> dict:
    ids, style = _Ids(), f["style"]
    body = []
    if f["photo"][0]:
        src = images.with_aspect(f["photo"][0], "3:2")
        body.append(_image(ids, src, f["photo"][1] or f["brand"], full=style != "letter"))
    body += [
        _heading(ids, f"What's new at {f['brand']}", top=28),
        _greeting_and(
            ids,
            f["pitch"] or f"Here's what's been happening at {f['brand']}, and what's coming up next.",
            "A few things I'd love you to see this month:",
        ),
        _item(ids, "latest:post", "Read it", layout="row", style=style),
        _item(ids, "next:event", "Save your spot", layout="row", style=style),
        _item(ids, "latest:course", "Take a look", layout="row", style=style),
        _sign_off(ids, f["owner"]),
    ]
    return {
        "name": "Newsletter",
        "category": TemplateCategory.NEWSLETTER,
        "subject": f"News from {f['brand']}",
        "preheader": "What's new, and what's coming up.",
        "design": _design(style, ids, body),
    }


def _launch(f) -> dict:
    ids, style = _Ids(), f["style"]
    outcome = _joined(f["outcome"])
    body = [
        _heading(ids, "Something new for you", size=34, top=32),
        _greeting_and(
            ids,
            "I've been working on something, and it's ready.",
            f"It's made to bring you {outcome}." if outcome else "",
        ),
        _item(ids, "latest:course", "See what's inside", layout="card", style=style),
        _text(ids, ["Questions? Just reply to this email."], top=12, bottom=4, size=15, color="brand:muted"),
        _sign_off(ids, f["owner"]),
    ]
    return {
        "name": "New offer",
        "category": TemplateCategory.LAUNCH,
        "subject": f"Something new from {f['brand']}",
        "preheader": "It's ready, and I made it with you in mind.",
        "design": _design(style, ids, body),
    }


def _invite(f) -> dict:
    ids, style = _Ids(), f["style"]
    body = [
        _heading(ids, "Join me", size=34, top=32),
        _greeting_and(ids, "I'd love to see you at my next session. Here are the details:"),
        _item(ids, "next:event", "Save your spot", layout="card", style=style),
        _text(
            ids, ["Can't make this one? There are more on my calendar."], top=12, bottom=0, size=15, color="brand:muted"
        ),
        _button(ids, "See all sessions", "/events", style, top=16),
        _sign_off(ids, f["owner"]),
    ]
    return {
        "name": "Class invitation",
        "category": TemplateCategory.EVENT,
        "subject": "Join me live",
        "preheader": "Here are the details of my next session.",
        "design": _design(style, ids, body),
    }


def _note(f) -> dict:
    ids, style = _Ids(), f["style"]
    first = f["owner"].split()[0] if f["owner"] else f["brand"]
    body = [
        _heading(ids, f"A note from {first}", size=26, top=28),
        _greeting_and(
            ids,
            "I wanted to write to you personally.",
            f["pitch"],
            "Write your note here. Tell them what's on your mind, what you're working on, "
            "or what you'd love them to try.",
        ),
        {
            "id": ids(),
            "type": "profile",
            "data": {
                "imageSrc": "",
                "imageAlt": "",
                "name": f["owner"] or f["brand"],
                "role": f["teaches"].capitalize() if f["teaches"] else f["brand"],
                "bio": "",
                "showBadge": False,
                "badgeText": "",
            },
            "style": {
                "padding": _pad(16, SIDE, 28),
                "backgroundColor": "brand:background",
                "borderStyle": "none",
                "borderWidth": 0,
                "nameColor": "brand:foreground",
                "nameFontFamily": "brand:heading",
                "roleColor": "brand:muted",
                "contentAlignment": "left",
                "imagePosition": "left",
            },
        },
    ]
    return {
        "name": "Personal note",
        "category": TemplateCategory.NOTE,
        "subject": f"A note from {first}",
        "preheader": "Something I wanted to share with you.",
        "design": _design(style, ids, body),
    }


def recipes(tenant) -> list[dict]:
    """The starters that fit what she offers."""
    from apps.courses.models import Course

    f = _facts(tenant)
    sells = f["offers"] & {"course", "download", "downloads", "membership"} or _has(Course.objects.all())
    runs_classes = f["offers"] & {"live", "onsite", "zoom", "stream"}
    out = [_newsletter(f)]
    if sells:
        out.append(_launch(f))
    if runs_classes:
        out.append(_invite(f))
    out.append(_note(f))
    return out


def ensure(tenant) -> list[EmailTemplate]:
    """Make her starters once (setup's milestone, or the first time she opens her templates)."""
    from apps.tenant_config.models import TenantConfig
    from apps.tenant_config.setup_flow import _update_flow

    cfg = TenantConfig.objects.first()
    if cfg is None or (cfg.setup_flow or {}).get("email_starters"):
        return []
    claimed = []

    def mutate(_config, flow):
        if not flow.get("email_starters"):
            flow["email_starters"] = True
            claimed.append(True)

    _update_flow(tenant, mutate)
    if not claimed:  # another request made them a moment ago
        return []
    return [
        EmailTemplate.objects.create(
            name=r["name"],
            category=r["category"],
            design=r["design"],
            subject=r["subject"][:255],
            preheader=r["preheader"][:255],
            source=TemplateSource.STARTER,
        )
        for r in recipes(tenant)
    ]


# ── a message laid out in a template's style (the team's drafts, demo emails) ──────────────────


def _donor(blocks, kind):
    """The first block of this kind in a template's body: its style dresses the new one."""
    return next((b for b in blocks if isinstance(b, dict) and b.get("type") == kind), None)


def compose(
    template_design: dict | None,
    *,
    heading: str,
    body_html: str = "",
    refs=(),
    button_text: str = "",
    button_url: str = "",
    style: str = DEFAULT_STYLE,
) -> dict:
    """An email with this message in a template's look: its header, footer and settings, and its own
    heading, text, item and button styles worn by the new words. No template: her brand's blank one."""
    import copy

    ids = _Ids()
    base = copy.deepcopy(template_design) if template_design else blank_design(style)
    for region in ("header", "body", "footer"):
        base.setdefault(region, {"blocks": []})
    old = base["body"].get("blocks") or []
    style = style if style in STYLES else DEFAULT_STYLE

    def dressed(new_block, kind):
        donor = _donor(old, kind)
        if donor is not None:
            new_block["style"] = copy.deepcopy(donor.get("style") or {})
        return new_block

    used = {b.get("id") for b in brand_blocks(base)}

    def fresh():
        while (candidate := f"d{ids()}") in used:
            pass
        used.add(candidate)
        return candidate

    body = []
    if heading:
        block = dressed(_heading(ids, heading, size=30, top=28), "heading")
        block["id"] = fresh()
        body.append(block)
    if body_html:
        block = dressed(
            {"id": fresh(), "type": "text", "data": {"html": body_html, "variables": []}, "style": {}}, "text"
        )
        if not block["style"]:
            block["style"] = _text(ids, ["x"])["style"]
        body.append(block)
    for ref in list(refs)[:4]:
        block = dressed(_item(ids, ref, "Take a look", layout="card" if len(refs) == 1 else "row", style=style), "item")
        block["id"] = fresh()
        body.append(block)
    if button_text and button_url:
        block = dressed(_button(ids, button_text, button_url, style), "button")
        block["id"] = fresh()
        body.append(block)
    base["body"]["blocks"] = body
    return base


def brand_blocks(design):
    from .brand import blocks_of

    return blocks_of(design)
