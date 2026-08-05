"""Pure block operations behind the copilot's add/remove/move actions.

Addable types and writable fields are ai_compose's WRITABLE_FIELDS — the same
trust boundary the edit engine uses (so no testimonials: fabricated social
proof stays impossible). All functions are dict-in/dict-out and never mutate
their inputs; DB writes happen in the execute view."""

from copy import deepcopy
from uuid import uuid4

from apps.core.onboarding.ai_compose import MAX_FAQ_ITEMS
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
    "upcomingEvents": {"layout": ("select", ("grid", "list")), "heading": _H},
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


def clean_link(value):
    """Same semantics as tenant_config's _clean_nav_href, but refusing (not
    blanking) unsafe schemes so the coach gets an honest card-drop reason."""
    href = str(value or "").strip()
    if href.lower().startswith(_UNSAFE_URL_PREFIXES):
        raise BlockOpError("links must be site paths like /courses or https:// URLs")
    return href[:300]


def clean_field(block_type, field, value):
    spec = (BLOCK_SCHEMA.get(block_type) or {}).get(field)
    if spec is None:
        raise BlockOpError(f"{block_type} has no editable field '{field}'")
    kind = spec[0]
    if kind == "text":
        return str(value)[: spec[1]]
    if kind == "rich":
        return sanitize_rich_text(str(value)[: spec[1]])
    if kind == "select":
        v = str(value).strip()
        if v not in spec[1]:
            raise BlockOpError(f"{field} must be one of: " + ", ".join(spec[1]))
        return v
    if kind == "link":
        return clean_link(value)
    if kind == "bool":
        return bool(value)
    _, item_caps, max_items = spec
    return [
        {k: str(it.get(k, ""))[:cap] for k, cap in item_caps.items()}
        for it in list(value or [])[:max_items]
        if isinstance(it, dict)
    ]


def build_block(block_type, fields):
    schema = BLOCK_SCHEMA.get(block_type)
    if schema is None:
        raise BlockOpError(f"unknown block type: {block_type}")
    block = {"id": mint_block_id(), "type": block_type, "enabled": True}
    for field, value in (fields or {}).items():
        if field in schema:
            block[field] = clean_field(block_type, field, value)
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
        raise BlockOpError(f"unknown page: {page}")
    return blocks_


def _index_of(blocks_, block_id, page):
    for i, b in enumerate(blocks_):
        if isinstance(b, dict) and b.get("id") == block_id:
            return i
    raise BlockOpError(f"no block {block_id} on {page}")


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


def move_block(pages, page, block_id, after_block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    moving = blocks_.pop(_index_of(blocks_, block_id, page))
    if after_block_id is None:
        blocks_.insert(0, moving)
    else:
        blocks_.insert(_index_of(blocks_, after_block_id, page) + 1, moving)
    return new_pages
