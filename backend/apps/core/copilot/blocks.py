"""Pure block operations behind the copilot's add/remove/move actions.

BLOCK_SCHEMA below is this module's own write surface: it mirrors the
frontend block registry's field set and select values, and is the trust
boundary for what the copilot may add or edit; styled-section families
(section.<family>) are derived from the synced manifest (apps.tenant_config.
sections) rather than hand-mirrored. testimonials is deliberately
absent so fabricated social proof stays impossible; gallery/logos/video wait
on image/URL handling. All functions are dict-in/dict-out and never mutate
their inputs; DB writes happen in the execute view."""

from copy import deepcopy
from uuid import uuid4

from django.utils import translation
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy, ngettext

from apps.core import languages
from apps.core.onboarding.ai_compose import MAX_FAQ_ITEMS
from apps.tenant_config import sections
from apps.tenant_config.defaults import sanitize_rich_text


class BlockOpError(Exception):
    """User-safe message describing why a block operation was refused."""


def mint_block_id() -> str:
    return f"blk_{uuid4().hex[:8]}"


_UNSAFE_URL_PREFIXES = ("javascript:", "data:", "vbscript:")
_H = ("text", 120)
MAX_STATS_ITEMS = 8

# Mirrors frontend-customer/src/lib/blocks/registry.tsx (selects verbatim).
# testimonials is deliberately absent; gallery/logos/video wait on image/URL
# handling (Phase 8 file intake).
BLOCK_SCHEMA = {
    "hero": {
        "layout": ("select", ("centered", "split", "minimal")),
        "heading": _H,
        "subheading": ("text", 200),
        "ctaText": ("text", 40),
        "ctaHref": ("link",),
        "overlay": ("select", ("none", "dark", "light")),
        "overlayStrength": ("select", ("light", "medium", "strong")),
    },
    "richText": {
        "layout": ("select", ("standard", "centered", "wide")),
        "heading": _H,
        "headingLevel": ("select", ("h1", "h2", "h3", "h4")),
        "body": ("rich", 2000),
    },
    "imageText": {
        "layout": ("select", ("split", "stacked", "card")),
        "heading": _H,
        "headingLevel": ("select", ("h1", "h2", "h3", "h4")),
        "body": ("rich", 2000),
        "imagePosition": ("select", ("right", "left")),
    },
    "cta": {
        "layout": ("select", ("centered", "banner", "split")),
        "heading": _H,
        "buttonText": ("text", 40),
        "buttonHref": ("link",),
        "secondaryButtonText": ("text", 40),
        "secondaryButtonHref": ("link",),
    },
    "faq": {
        "layout": ("select", ("accordion", "open", "columns")),
        "heading": _H,
        "items": ("items", {"q": 150, "a": 500}, MAX_FAQ_ITEMS),
    },
    "contact": {
        "layout": ("select", ("centered", "split", "card")),
        "heading": _H,
        "intro": ("text", 200),
        "submitLabel": ("text", 40),
        "successMessage": ("text", 200),
    },
    "courseGrid": {"layout": ("select", ("standard", "centered")), "heading": _H},
    "pricingPlans": {"layout": ("select", ("cards", "compact")), "heading": _H, "subheading": ("text", 200)},
    "upcomingEvents": {"layout": ("select", ("grid", "list")), "heading": _H, "showCovers": ("bool",)},
    "storeProducts": {"layout": ("select", ("grid", "list")), "heading": _H},
    "stats": {
        "layout": ("select", ("cards", "plain", "band")),
        "heading": _H,
        "items": ("items", {"value": 40, "label": 80}, MAX_STATS_ITEMS),
    },
    "banner": {
        "layout": ("select", ("bar", "full", "soft")),
        "text": ("text", 150),
        "linkText": ("text", 40),
        "linkHref": ("link",),
        "dismissible": ("bool",),
    },
}


def _section_schema(family):
    """Copilot write surface for one manifest family, in BLOCK_SCHEMA's tuple
    format. Image fields stay out (set_block_image places photos); item lists
    whose items hold images (moments) stay out too — editor only."""
    schema = {}
    for name, spec in family["fields"].items():
        kind = spec.get("type")
        if kind in ("text", "richtext"):
            schema[name] = ("text" if kind == "text" else "rich", spec.get("max", 200))
        elif kind in ("link", "bool"):
            schema[name] = (kind,)
        elif kind == "select":
            schema[name] = ("select", tuple(str(o) for o in spec.get("options") or ()))
        elif kind == "items":
            item_fields = spec.get("fields") or {}
            if all(f.get("type") == "text" for f in item_fields.values()):
                schema[name] = ("items", {k: f.get("max", 200) for k, f in item_fields.items()}, spec.get("max", 6))
    return schema


# Styled sections (section.<family>) derive from the synced manifest. proof is
# left out like testimonials (her clients' words come only from her, through
# the editor or setup) and video like the legacy video block (it needs a clip).
BLOCK_SCHEMA.update(
    {
        f"{sections.SECTION_PREFIX}{fam}": _section_schema(spec)
        for fam, spec in sections.families().items()
        if fam not in sections.AI_NEVER_FAMILIES
    }
)

# Placeholder copy for required section text the model left out, so an added
# section never renders empty. It lands on the page, so it is in the site's
# language (the coach reads it on the confirm card and edits it).
_SECTION_PLACEHOLDERS = {
    "headline": gettext_lazy("Welcome"),
    "body": gettext_lazy("<p>A few words about who you are and how you work.</p>"),
    "statement": gettext_lazy("Every student grows best at their own pace."),
    "ctaLabel": gettext_lazy("Get started"),
    "title": gettext_lazy("%(label)s %(n)d"),
    "text": gettext_lazy("A short line about this."),
    "q": gettext_lazy("Question %(n)d?"),
    "a": gettext_lazy("The answer goes here."),
}
_SECTION_HEADINGS = {
    "story": gettext_lazy("About me"),
    "benefits": gettext_lazy("What you'll gain"),
    "howItWorks": gettext_lazy("How it works"),
    "faq": gettext_lazy("Frequently asked questions"),
    "cta": gettext_lazy("Ready to begin?"),
    "contact": gettext_lazy("Get in touch"),
}


def _placeholder(family, field, label="", n=1):
    with translation.override(languages.site_language()):
        if field == "heading":
            return str(_SECTION_HEADINGS.get(family) or sections.families()[family]["label"])
        text = _SECTION_PLACEHOLDERS.get(field)
        return str(text) % {"label": label, "n": n} if text else ""


def _seed_section(block, family):
    """Fill required top-level text, and empty item lists up to their min."""
    for name, spec in sections.families()[family]["fields"].items():
        if spec.get("type") in ("text", "richtext") and spec.get("required") and not block.get(name):
            block[name] = _placeholder(family, name)
        elif spec.get("type") == "items" and spec.get("min") and not block.get(name):
            label = spec.get("itemLabel", "Item")
            block[name] = [
                {k: _placeholder(family, k, label, n) for k, f in spec["fields"].items() if f.get("required")}
                for n in range(1, spec["min"] + 1)
            ]


def clean_link(value):
    """Same semantics as tenant_config's _clean_nav_href, but refusing (not
    blanking) unsafe schemes so the coach gets an honest card-drop reason."""
    href = str(value or "").strip()
    if href.lower().startswith(_UNSAFE_URL_PREFIXES):
        raise BlockOpError(_("links must be site paths like /courses or https:// URLs"))
    return href[:300]


def clean_field(block_type, field, value):
    spec = (BLOCK_SCHEMA.get(block_type) or {}).get(field)
    if spec is None:
        raise BlockOpError(
            _("%(block_type)s has no editable field '%(field)s'") % {"block_type": block_type, "field": field}
        )
    kind = spec[0]
    # Sections cut on a word boundary and measure rich text as plain text
    # (manifest semantics); legacy blocks keep their hard cut.
    section = block_type in sections.SECTION_TYPES

    def cut(text, limit):
        return sections.clamp_text(text, limit) if section else text[:limit]

    if kind == "text":
        return cut(str(value), spec[1])
    if kind == "rich":
        if section:
            return sections.clamp_richtext(str(value), spec[1])
        return sanitize_rich_text(str(value)[: spec[1]])
    if kind == "select":
        v = str(value).strip()
        if v not in spec[1]:
            raise BlockOpError(
                _("%(field)s must be one of: %(options)s") % {"field": field, "options": ", ".join(spec[1])}
            )
        return v
    if kind == "link":
        return clean_link(value)
    if kind == "bool":
        if isinstance(value, str):
            v = value.strip().lower()
            if v == "true":
                return True
            if v == "false":
                return False
            raise BlockOpError(_("%(field)s must be true or false") % {"field": field})
        return bool(value)
    _kind, item_caps, max_items = spec
    return [
        {k: cut(str(it.get(k, "")), cap) for k, cap in item_caps.items()}
        for it in list(value or [])[:max_items]
        if isinstance(it, dict)
    ]


def build_block(block_type, fields, style_id=""):
    """A new block of ``block_type``. Section blocks take the default layout of
    the tenant's style (``style_id``) for their family and get placeholder
    copy for any required text the model left out."""
    schema = BLOCK_SCHEMA.get(block_type)
    if schema is None:
        raise BlockOpError(_("unknown block type: %(block_type)s") % {"block_type": block_type})
    block = {"id": mint_block_id(), "type": block_type, "enabled": True}
    family = sections.family_of(block_type)
    if family:
        family_fields = sections.families()[family]["fields"]
        if any(spec.get("type") == "items" and name not in schema for name, spec in family_fields.items()):
            raise BlockOpError(
                _("the %(family)s section needs photos — add it from the page editor") % {"family": family}
            )
        variant = sections.resolve_variant(style_id, family, None) if style_id else None
        if variant is None:
            raise BlockOpError(
                _("%(block_type)s needs a site style — switch to a style first") % {"block_type": block_type}
            )
        block["variant"] = variant
    for field, value in (fields or {}).items():
        if field in schema:
            block[field] = clean_field(block_type, field, value)
    if family:
        _seed_section(block, family)
    return block


def page_blocks(page_value):
    """The canonical pages shape wraps each page's blocks: {"blocks": [...]}
    (see ai_compose._apply). Legacy/fixture bare lists are tolerated.
    Returns the blocks list, or None when the value is neither shape."""
    if isinstance(page_value, dict) and isinstance(page_value.get("blocks"), list):
        return page_value["blocks"]
    if isinstance(page_value, list):
        return page_value
    return None


def _page_blocks(pages, page):
    blocks_ = page_blocks((pages or {}).get(page))
    if blocks_ is None:
        raise BlockOpError(_("unknown page: %(page)s") % {"page": page})
    return blocks_


def _index_of(blocks_, block_id, page):
    for i, b in enumerate(blocks_):
        if isinstance(b, dict) and b.get("id") == block_id:
            return i
    raise BlockOpError(_("no block %(block_id)s on %(page)s") % {"block_id": block_id, "page": page})


def add_block(pages, page, block, after_block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    if after_block_id is None:
        blocks_.append(block)
    else:
        blocks_.insert(_index_of(blocks_, after_block_id, page) + 1, block)
    return new_pages


def remove_block(pages, page, block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    blocks_.pop(_index_of(blocks_, block_id, page))
    return new_pages


def move_block(pages, page, block_id, after_block_id, to_page=None):
    new_pages = deepcopy(pages)
    source = _page_blocks(new_pages, page)
    target_page = to_page or page
    target = _page_blocks(new_pages, target_page)  # validate target BEFORE popping
    moving = source.pop(_index_of(source, block_id, page))
    if after_block_id is None:
        target.insert(0, moving)
    else:
        target.insert(_index_of(target, after_block_id, target_page) + 1, moving)
    return new_pages


def set_block_enabled(pages, page, block_id, enabled):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    block = blocks_[_index_of(blocks_, block_id, page)]
    if bool(block.get("enabled", True)) == bool(enabled):
        raise BlockOpError(
            (_("%(id)s is already visible") if enabled else _("%(id)s is already hidden")) % {"id": block_id}
        )
    block["enabled"] = bool(enabled)
    return new_pages


def duplicate_block(pages, page, block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    i = _index_of(blocks_, block_id, page)
    copy_ = deepcopy(blocks_[i])
    copy_["id"] = mint_block_id()
    blocks_.insert(i + 1, copy_)
    return new_pages, copy_["id"]


def _preview(value):
    if value is None:
        return None
    if isinstance(value, list):
        return ngettext("%(n)d item", "%(n)d items", len(value)) % {"n": len(value)}
    return str(value)[:200]


def edit_block_fields(pages, page, block_id, fields):
    """Surgical field writes on one block. Returns (new_pages, changes);
    changes carry display previews for the confirm card's diff rows."""
    if not fields:
        raise BlockOpError(_("no fields to change"))
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    block = blocks_[_index_of(blocks_, block_id, page)]
    changes = []
    for field, value in fields.items():
        cleaned = clean_field(block.get("type"), field, value)
        if block.get(field) == cleaned:
            continue
        changes.append({"field": field, "old": _preview(block.get(field)), "new": _preview(cleaned)})
        block[field] = cleaned
    if not changes:
        raise BlockOpError(_("those fields already have those values"))
    return new_pages, changes
