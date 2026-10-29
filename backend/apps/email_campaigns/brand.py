"""Her brand in an email: the kit (name, site, logo, colours, fonts, socials) and the step that turns a
stored design into one the renderer can draw (``resolve``): ``brand:`` tokens become her colours and
fonts, site-relative links become links on her site, item blocks get what they show today.

``build`` is the one way to an email's HTML for campaigns, previews and tests; transactional emails use
the kit and the renderer directly.
"""

import copy
import html
import re

from django.conf import settings
from django.utils.html import strip_tags
from django.utils.translation import gettext as _
from django.utils.translation import override

from apps.core import languages

from . import catalog, images, render

# email token -> the look palette's token
TOKENS = {
    "primary": "primary",
    "primaryForeground": "primaryForeground",
    "accent": "accent",
    "accentForeground": "accentForeground",
    "background": "background",
    "surface": "surface",
    "foreground": "foreground",
    "muted": "mutedForeground",
    "border": "border",
    "inverse": "inverse",
    "inverseForeground": "inverseForeground",
}
FALLBACK_COLORS = {
    "primary": "#1a56db",
    "primaryForeground": "#ffffff",
    "accent": "#1a56db",
    "accentForeground": "#ffffff",
    "background": "#ffffff",
    "surface": "#f4f4f2",
    "foreground": "#1c1917",
    "muted": "#6b6b6b",
    "border": "#e5e5e5",
    "inverse": "#1c1917",
    "inverseForeground": "#fafaf9",
}
FALLBACK_FONTS = {"heading": "Georgia, serif", "body": "Helvetica, Arial, sans-serif"}
TOKEN_PREFIX = "brand:"  # noqa: S105 — a colour/font token, not a secret
SOCIAL_ORDER = ("instagram", "youtube", "tiktok", "facebook", "x", "linkedin")


def kit(tenant, cfg=None) -> dict:
    """Her name, site, mark, logo, look and socials as email-safe values."""
    from apps.tenant_config import sections
    from apps.tenant_config.interview_brief import answers_of

    cfg = cfg if cfg is not None else catalog._config()
    style_id = cfg.style if cfg and sections.style(cfg.style) else sections.default_style()
    look = sections.style(style_id) or {}
    palette = (sections.palettes(style_id).get(cfg.palette if cfg else "") or {}).get("palette") or look.get("palette")
    colors = {
        token: sections.oklch_to_hex((palette or {}).get(look_token)) or FALLBACK_COLORS[token]
        for token, look_token in TOKENS.items()
    }
    fonts = look.get("fonts") or {}
    try:
        radius = min(24, round(float(str(look.get("radius") or "0.5rem").removesuffix("rem")) * 16))
    except ValueError:
        radius = 8
    site = catalog.site_of(tenant)
    socials = dict((cfg.social_links if cfg else None) or {})
    answers = answers_of(tenant)
    return {
        "name": (cfg.brand_name if cfg else "") or tenant.name,
        "site": site,
        "host": site.split("://", 1)[-1],
        # Her uploaded or studio logo on a lasting link; else her square mark (or initial), drawn by her site.
        "logo": images.stable_url_for(cfg.logo, cfg.logo_url, site=site) if cfg else "",
        "mark": f"{site}/pwa-icon?size=192",
        "colors": colors,
        "fonts": {
            "heading": catalog.font_stack(fonts["display"]) if fonts.get("display") else FALLBACK_FONTS["heading"],
            "body": catalog.font_stack(fonts["body"]) if fonts.get("body") else FALLBACK_FONTS["body"],
        },
        "radius": radius,
        "socials": [
            {"network": n, "url": socials[n]}
            for n in SOCIAL_ORDER
            if isinstance(socials.get(n), str) and socials[n].startswith(("https://", "http://"))
        ],
        # The place she gave for her in-person sessions, her business address.
        "address": str(answers.get("address") or "")[:200],
        "language": languages.resolve(cfg.default_locale if cfg else None),
    }


def platform_kit(language: str = languages.DEFAULT) -> dict:
    """Contentor's own kit (its mark, ink and amber), for the superadmin's emails to coaches."""
    from django.templatetags.static import static

    site = f"{settings.SITE_SCHEME}://{settings.CONTENTOR_DOMAIN}"
    return {
        "name": "Contentor",
        "site": site,
        "host": settings.CONTENTOR_DOMAIN,
        "logo": "",
        "mark": site + static("email/contentor-mark.png"),
        "colors": {
            **FALLBACK_COLORS,
            "primary": "#171614",
            "primaryForeground": "#f5f3ef",
            "accent": "#e1ad63",
            "accentForeground": "#171614",
            "surface": "#f5f3ef",
            "foreground": "#171614",
            "muted": "#6b655e",
            "border": "#e4dfd7",
            "inverse": "#171614",
            "inverseForeground": "#f5f3ef",
        },
        "fonts": {"heading": "Helvetica, Arial, sans-serif", "body": "Helvetica, Arial, sans-serif"},
        "radius": 10,
        "socials": [],
        "address": "",
        "language": languages.resolve(language),
    }


# ── resolving a stored design ──────────────────────────────────────────────────────────────────


def _token_value(value: str, kit_: dict) -> str | None:
    """A known token's value in this kit, else None (the string is left as written)."""
    name = value[len(TOKEN_PREFIX) :]
    if name in FALLBACK_FONTS:
        return kit_["fonts"].get(name) or FALLBACK_FONTS[name]
    if name in FALLBACK_COLORS:
        return kit_["colors"].get(name) or FALLBACK_COLORS[name]
    return None


_LINK_KEYS = ("url", "buttonUrl", "link", "href")
_HREF = re.compile(r'(href\s*=\s*")(/[^"]*)(")', re.I)


def _walk(node, kit_, site):
    if isinstance(node, dict):
        for key, value in node.items():
            if isinstance(value, str):
                if value.startswith(TOKEN_PREFIX) and (token := _token_value(value, kit_)) is not None:
                    node[key] = token
                elif key in _LINK_KEYS and value.startswith("/") and not value.startswith("//"):
                    node[key] = site + value
                elif key == "html" and 'href="/' in value:
                    node[key] = _HREF.sub(lambda m: m.group(1) + site + m.group(2) + m.group(3), value)
            else:
                _walk(value, kit_, site)
    elif isinstance(node, list):
        for value in node:
            _walk(value, kit_, site)


def blocks_of(design: dict):
    """Every block in the design, nested ones included, top to bottom."""

    def walk(blocks):
        for block in blocks if isinstance(blocks, list) else []:
            if not isinstance(block, dict):
                continue
            yield block
            for column in (block.get("data") or {}).get("columns") or []:
                if isinstance(column, dict):
                    yield from walk(column.get("blocks"))

    for region in ("header", "body", "footer"):
        yield from walk(((design or {}).get(region) or {}).get("blocks"))


def refs_in(design: dict) -> list[str]:
    return [b["data"]["ref"] for b in blocks_of(design) if b.get("type") == "item" and (b.get("data") or {}).get("ref")]


def resolve(design: dict, kit_: dict, found: dict | None = None) -> tuple[dict, list[str]]:
    """A copy the renderer can draw: tokens resolved, links absolute, each item block carrying its
    item (``found``: ref -> item, from catalog.find). Returns (design, warnings)."""
    out = copy.deepcopy(design or {})
    _walk(out, kit_, kit_["site"])
    warnings = []
    for block in blocks_of(out):
        if block.get("type") != "item":
            continue
        data = block.setdefault("data", {})
        item = (found or {}).get(data.get("ref") or "")
        if item:
            data["_item"] = item
        else:
            data.pop("_item", None)
            warnings.append(f"A featured item ({data.get('ref') or 'none picked'}) isn't available, so it's left out.")
    return out, warnings


def build(design: dict, tenant=None, *, subject: str = "", preheader: str = "", kit_: dict | None = None):
    """-> (html, text, warnings): the email as sent, with {{FirstName}}/{{UnsubscribeUrl}} left for
    ``render.personalize``. ``tenant`` None: no catalog (the platform's emails)."""
    # Students read it in the site's language; the platform's own emails (no tenant) in their kit's.
    with override(
        languages.site_language(tenant) if tenant is not None else (kit_ or {}).get("language", languages.DEFAULT)
    ):
        kit_ = kit_ or kit(tenant)
        found = catalog.find(refs_in(design), tenant) if tenant is not None else {}
        resolved, warnings = resolve(design, kit_, found)
        email = render.render(resolved, kit=kit_, subject=subject, preheader=preheader)
        return email, to_text(resolved, kit_), warnings


def to_text(design: dict, kit_: dict) -> str:
    """The plain-text part: headings, paragraphs, buttons and items with their links."""
    out = []
    for block in blocks_of(design):
        data, kind = block.get("data") or {}, block.get("type")
        if kind == "heading":
            out += ["", str(data.get("text") or "").strip()]
        elif kind == "text":
            text = re.sub(r"<(?:/p|br\s*/?|/li)>", "\n", str(data.get("html") or ""), flags=re.I)
            plain = html.unescape(strip_tags(text))
            out.append("\n".join(" ".join(line.split()) for line in plain.splitlines()).strip())
        elif kind == "button" and data.get("url"):
            out.append(f"{data.get('text') or _('Open')}: {data['url']}")
        elif kind == "hero":
            out += [str(data.get("heading") or ""), str(data.get("subheading") or "")]
            if data.get("buttonUrl") and data.get("buttonText"):
                out.append(f"{data['buttonText']}: {data['buttonUrl']}")
        elif kind == "card":
            out += [str(data.get("heading") or ""), str(data.get("body") or "")]
            if data.get("showButton") and data.get("buttonUrl"):
                out.append(f"{data.get('buttonText') or _('Open')}: {data['buttonUrl']}")
        elif kind == "item" and isinstance(data.get("_item"), dict):
            item = data["_item"]
            out += ["", item["title"], item.get("meta") or "", item.get("url") or ""]
        elif kind == "list":
            out += [f"• {i.get('text', '')}" for i in data.get("items") or [] if isinstance(i, dict)]
        elif kind == "brandFooter":
            out += ["", "—", f"{kit_['name']} · {kit_['site']}"]
    text = "\n".join(line for line in out if line is not None)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


# ── cleaning what is stored ────────────────────────────────────────────────────────────────────

_TEXT_TAGS = {"p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "span", "blockquote"}
_HTML_TAGS = _TEXT_TAGS | {
    "div", "table", "tbody", "thead", "tr", "td", "th", "img", "h1", "h2", "h3", "h4", "hr", "center",
}  # fmt: skip
_STYLE_PROPS = {
    "color", "background-color", "font-family", "font-size", "font-weight", "font-style", "text-align",
    "text-decoration", "line-height", "letter-spacing", "margin", "padding", "border", "border-radius", "width",
    "max-width", "height", "display", "vertical-align",
}  # fmt: skip
_TEXT_ATTRS = {tag: {"style"} for tag in _TEXT_TAGS} | {"a": {"href", "target", "style", "title"}}
_HTML_ATTRS = {tag: {"style", "align", "valign", "width", "height", "bgcolor"} for tag in _HTML_TAGS} | {
    "a": {"href", "target", "style", "title"},
    "img": {"src", "alt", "width", "height", "style"},
    "table": {"style", "width", "cellpadding", "cellspacing", "border", "role", "align", "bgcolor"},
}
BLOCK_TYPES = frozenset(render.BLOCK_RENDERERS)
MAX_BLOCKS = 300
MAX_DESIGN_BYTES = 512 * 1024


class DesignError(ValueError):
    pass


def _clean_html(value, tags, attrs) -> str:
    import nh3

    return nh3.clean(
        str(value or ""),
        tags=tags,
        attributes=attrs,
        filter_style_properties=_STYLE_PROPS,
        url_schemes={"http", "https", "mailto"},
    )


def clean_design(design) -> dict:
    """A design safe to store and to draw in the editor: known regions and block types only, rich text
    clamped to a safe allowlist (the canvas renders it as HTML), size-bounded. Raises DesignError."""
    import json

    if not isinstance(design, dict):
        raise DesignError(_("The design must be an object."))
    if len(json.dumps(design)) > MAX_DESIGN_BYTES:
        raise DesignError(_("This email is too large."))
    out = {
        "version": 1,
        "settings": design.get("settings") if isinstance(design.get("settings"), dict) else {},
    }
    count = 0

    def clean_blocks(blocks):
        nonlocal count
        kept = []
        for block in blocks if isinstance(blocks, list) else []:
            if not isinstance(block, dict) or block.get("type") not in BLOCK_TYPES:
                continue
            count += 1
            if count > MAX_BLOCKS:
                raise DesignError(_("This email has too many blocks."))
            block = {
                "id": str(block.get("id") or f"b{count}")[:64],
                "type": block["type"],
                "data": dict(block.get("data") or {}) if isinstance(block.get("data"), dict) else {},
                "style": dict(block.get("style") or {}) if isinstance(block.get("style"), dict) else {},
            }
            data = block["data"]
            data.pop("_item", None)  # resolved at send time, never stored
            if block["type"] == "text":
                data["html"] = _clean_html(data.get("html"), _TEXT_TAGS, _TEXT_ATTRS)
            elif block["type"] == "html":
                data["html"] = _clean_html(data.get("html"), _HTML_TAGS, _HTML_ATTRS)
            if isinstance(data.get("columns"), list):
                data["columns"] = [
                    {**col, "blocks": clean_blocks(col.get("blocks"))}
                    for col in data["columns"]
                    if isinstance(col, dict)
                ]
            kept.append(block)
        return kept

    for region in ("header", "body", "footer"):
        out[region] = {
            "blocks": clean_blocks(
                ((design.get(region) or {}) if isinstance(design.get(region), dict) else {}).get("blocks")
            )
        }
    return out
