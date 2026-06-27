"""Page/block catalog + defaults for the coach website builder.

`TenantConfig.pages` stores the coach's site as a dict keyed by a fixed set of
page keys, each holding an ordered list of blocks::

    {
      "home":    {"blocks": [ {"id", "type", "enabled", ...fields}, ... ]},
      "about":   {"blocks": [...]},
      ...
    }

Blocks are theme-locked by default: they carry content (text/images/links) and
the chosen theme supplies all styling. A block may *additionally* carry an
optional, tightly-clamped ``style`` override — a theme-token background, a
vertical-spacing step, and text alignment (see ``BLOCK_STYLE_ALLOWLIST`` /
``sanitize_block_style``). Overrides are theme-token-first (never raw colors),
so pages stay on-brand and dark-mode-safe; an unstyled block renders exactly as
before.

This module is the single source of truth for the page keys, the block-type
catalog, the per-block style-override allowlist, the new-tenant default content,
and the one-way conversion from the legacy ``landing_sections`` shape. It
contains only pure-Python data helpers (no model access) so it can be imported
safely from migrations, serializers, and the seed commands alike.
"""

from __future__ import annotations

# Fixed set of buildable pages. ``pricing`` renders at the /plans route on the
# frontend; the mismatch is resolved there, not here.
KNOWN_PAGE_KEYS = ("home", "about", "courses", "pricing", "faq", "contact")

# Every block type the builder understands. Content blocks render static,
# coach-authored content; dynamic blocks pull live data (courses, plans, etc.)
# at render time and store only presentation choices.
CONTENT_BLOCK_TYPES = (
    "hero",
    "richText",
    "imageText",
    "gallery",
    "testimonials",
    "faq",
    "cta",
    "stats",
    "logos",
    "video",
    "banner",
    "contact",
)
DYNAMIC_BLOCK_TYPES = (
    "courseGrid",
    "pricingPlans",
    "upcomingEvents",
    "storeProducts",
)
KNOWN_BLOCK_TYPES = frozenset(CONTENT_BLOCK_TYPES + DYNAMIC_BLOCK_TYPES)

# --- Optional per-block style overrides (hybrid theme-lock) ------------------
# Theme-token-first overrides a coach may set on a block. Theme-lock stays the
# default: a block with no ``style`` (or an empty one) renders exactly as the
# theme dictates. Backgrounds are theme TOKENS, never raw colors, so dark mode
# and theme switching keep working and pages can't go off-brand.
STYLE_BACKGROUND_TOKENS = ("default", "muted", "card", "accent", "primary")
STYLE_SPACING_VALUES = ("none", "compact", "normal", "spacious")
STYLE_ALIGN_VALUES = ("left", "center", "right")
# Text colour is a theme TOKEN too (foreground / muted-foreground / primary) so
# coach-set text stays on-brand and dark-mode-safe. "default" is the no-op.
STYLE_TEXT_COLOR_TOKENS = ("default", "muted", "brand")

# Which override keys each block type may carry. Server-authoritative: the
# frontend may surface a subset of controls, but must never widen this set.
# Structural/dynamic blocks get only outer chrome (background/spacing) so their
# themed inner cards stay consistent.
BLOCK_STYLE_ALLOWLIST = {
    # hero has its own layout presets + background image, so no generic
    # background/spacing override (a token background would be hidden behind the
    # image, and its height is min-height-driven so spacing does nothing). It
    # still allows textColor for its no-image layouts; image legibility is
    # handled by the hero's own image-shade fields.
    "hero": frozenset({"textColor"}),
    "richText": frozenset({"background", "spacing", "align", "textColor"}),
    "imageText": frozenset({"background", "spacing", "textColor"}),
    "cta": frozenset({"background", "spacing", "align", "textColor"}),
    "stats": frozenset({"background", "spacing", "align", "textColor"}),
    "testimonials": frozenset({"background", "spacing", "textColor"}),
    "faq": frozenset({"background", "spacing", "textColor"}),
    "logos": frozenset({"background", "spacing", "textColor"}),
    "banner": frozenset({"align", "textColor"}),
    "gallery": frozenset({"spacing", "textColor"}),
    "video": frozenset({"spacing", "textColor"}),
    "contact": frozenset({"background", "spacing", "textColor"}),
    # Dynamic blocks render themed inner cards — only outer spacing, never a
    # background that would force the card text out of contrast. textColor is
    # allowed but applied to the section heading only (cards stay themed).
    "courseGrid": frozenset({"spacing", "textColor"}),
    "pricingPlans": frozenset({"spacing", "textColor"}),
    "upcomingEvents": frozenset({"spacing", "textColor"}),
    "storeProducts": frozenset({"spacing", "textColor"}),
}


def sanitize_block_style(block_type, style):
    """Clamp a block's optional ``style`` override to the per-type allowlist.

    Returns a dict containing only allowlisted keys with enum-valid values, or
    ``None`` when nothing valid remains. Theme-safe by construction: unknown
    keys/values are dropped (not rejected — preserving forward-compat with the
    frontend), and no-op values (``default`` background, ``normal`` spacing) are
    omitted so an unstyled block serialises byte-for-byte as before.
    """
    if not isinstance(style, dict):
        return None
    allowed = BLOCK_STYLE_ALLOWLIST.get(block_type, frozenset())
    out = {}
    background = style.get("background")
    if "background" in allowed and background in STYLE_BACKGROUND_TOKENS and background != "default":
        out["background"] = background
    spacing = style.get("spacing")
    if "spacing" in allowed and spacing in STYLE_SPACING_VALUES and spacing != "normal":
        out["spacing"] = spacing
    align = style.get("align")
    if "align" in allowed and align in STYLE_ALIGN_VALUES:
        out["align"] = align
    text_color = style.get("textColor")
    if "textColor" in allowed and text_color in STYLE_TEXT_COLOR_TOKENS and text_color != "default":
        out["textColor"] = text_color
    return out or None


# --- Rich-text (HTML) fields ------------------------------------------------
# Block fields whose value is coach-authored rich text. Sanitised to a safe
# tag/attribute allowlist on save (server-authoritative), so the stored HTML can
# never carry scripts/event-handlers/unsafe URLs and is safe to render directly.
RICH_TEXT_FIELDS = frozenset({"body"})

_RICH_TEXT_TAGS = {
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "a",
    "blockquote",
    "span",
    "div",
    "h2",
    "h3",
    "h4",
}
_RICH_TEXT_ATTRS = {"a": {"href", "title"}}


def sanitize_rich_text(value):
    """Clamp a rich-text HTML value to a safe tag/attribute allowlist.

    Strips scripts, event handlers, and unsafe URL schemes (nh3 only keeps
    http/https/mailto on links). Non-string input becomes ``""``. Plain text
    (no tags) passes through unchanged.
    """
    if not isinstance(value, str):
        return ""
    if not value:
        return value
    import nh3

    return nh3.clean(value, tags=_RICH_TEXT_TAGS, attributes=_RICH_TEXT_ATTRS)


def _image(url=None, photo_id=None):
    """An image field value: a resolved URL plus the Photo id it came from.

    The serializer re-signs ``url`` from ``photo_id`` on every read because
    presigned URLs expire.
    """
    return {"url": url or None, "photo_id": str(photo_id) if photo_id else None}


def default_pages(brand_name: str = "") -> dict:
    """Starter content a brand-new tenant gets for all six pages.

    Block ids are deterministic and unique within a page; the frontend assigns
    ``crypto.randomUUID()`` ids only to blocks the coach adds later.
    """
    welcome = f"Welcome to {brand_name}" if brand_name else "Welcome"
    return {
        "home": {
            "blocks": [
                {
                    "id": "blk_hero",
                    "type": "hero",
                    "enabled": True,
                    "heading": welcome,
                    "subheading": "Explore our courses and start learning today.",
                    "ctaText": "Browse Courses",
                    "ctaHref": "/courses",
                    "bgImage": _image(),
                },
                {
                    "id": "blk_about",
                    "type": "imageText",
                    "enabled": False,
                    "heading": "About",
                    "body": "",
                    "image": _image(),
                    "imagePosition": "right",
                },
                {
                    "id": "blk_courses",
                    "type": "courseGrid",
                    "enabled": True,
                    "heading": "Featured Courses",
                },
                {
                    "id": "blk_testimonials",
                    "type": "testimonials",
                    "enabled": False,
                    "heading": "What students say",
                    "items": [],
                },
                {
                    "id": "blk_cta",
                    "type": "cta",
                    "enabled": True,
                    "heading": "Ready to start learning?",
                    "buttonText": "Join Now",
                    "buttonHref": "/courses",
                },
            ]
        },
        "about": {
            "blocks": [
                {
                    "id": "blk_about_intro",
                    "type": "richText",
                    "enabled": True,
                    "heading": "About",
                    "body": "",
                },
                {
                    "id": "blk_about_bio",
                    "type": "imageText",
                    "enabled": True,
                    "heading": "",
                    "body": "",
                    "image": _image(),
                    "imagePosition": "right",
                },
            ]
        },
        "courses": {
            "blocks": [
                {
                    "id": "blk_courses_grid",
                    "type": "courseGrid",
                    "enabled": True,
                    "heading": "All Courses",
                },
            ]
        },
        "pricing": {
            "blocks": [
                {
                    "id": "blk_pricing_plans",
                    "type": "pricingPlans",
                    "enabled": True,
                    "heading": "Plans & Pricing",
                    "subheading": "Choose a plan that fits your goals.",
                },
            ]
        },
        "faq": {
            "blocks": [
                {
                    "id": "blk_faq",
                    "type": "faq",
                    "enabled": True,
                    "heading": "Frequently asked questions",
                    "items": [],
                },
            ]
        },
        "contact": {
            "blocks": [
                {
                    "id": "blk_contact",
                    "type": "contact",
                    "enabled": True,
                    "heading": "Get in touch",
                    "intro": "Have a question? Send us a message.",
                    "submitLabel": "Send message",
                    "successMessage": "Thanks! We'll get back to you soon.",
                },
            ]
        },
    }


def pages_from_landing_sections(sections: dict | None, brand_name: str = "") -> dict:
    """Convert the legacy ``landing_sections`` dict into the new ``pages`` shape.

    Maps the six fixed sections onto the home page (hero, about→imageText,
    courses→courseGrid, testimonials, faq, cta), preserving enabled flags,
    content, and photo ids. The About and FAQ pages are seeded from their
    corresponding home sections so they aren't empty; the remaining pages get
    default starter blocks. Used by both the backfill migration and the seed
    commands so real and demo tenants convert identically.
    """
    sections = sections or {}
    pages = default_pages(brand_name)

    home_blocks: list[dict] = []

    hero = sections.get("hero")
    if isinstance(hero, dict):
        home_blocks.append(
            {
                "id": "blk_hero",
                "type": "hero",
                "enabled": hero.get("enabled", True),
                "heading": hero.get("headline", ""),
                "subheading": hero.get("subheadline", ""),
                "ctaText": hero.get("cta_text", ""),
                "ctaHref": hero.get("cta_href", ""),
                "bgImage": _image(hero.get("bg_image_url"), hero.get("bg_image_photo_id")),
            }
        )

    about = sections.get("about")
    about_block = None
    if isinstance(about, dict):
        about_block = {
            "id": "blk_about",
            "type": "imageText",
            "enabled": about.get("enabled", True),
            "heading": about.get("heading", "About"),
            "body": about.get("body", ""),
            "image": _image(about.get("image_url"), about.get("image_photo_id")),
            "imagePosition": "right",
        }
        home_blocks.append(about_block)

    courses = sections.get("courses")
    if isinstance(courses, dict):
        home_blocks.append(
            {
                "id": "blk_courses",
                "type": "courseGrid",
                "enabled": courses.get("enabled", True),
                "heading": courses.get("heading", "Featured Courses"),
            }
        )

    testimonials = sections.get("testimonials")
    if isinstance(testimonials, dict):
        home_blocks.append(
            {
                "id": "blk_testimonials",
                "type": "testimonials",
                "enabled": testimonials.get("enabled", True),
                "heading": testimonials.get("heading", ""),
                "items": [
                    {
                        "name": it.get("name", ""),
                        "text": it.get("text", ""),
                        "avatar": _image(it.get("avatar_url"), it.get("avatar_photo_id")),
                    }
                    for it in testimonials.get("items", [])
                    if isinstance(it, dict)
                ],
            }
        )

    faq = sections.get("faq")
    faq_block = None
    if isinstance(faq, dict):
        faq_block = {
            "id": "blk_faq",
            "type": "faq",
            "enabled": faq.get("enabled", True),
            "heading": faq.get("heading", "FAQ"),
            "items": [
                {"q": it.get("q", ""), "a": it.get("a", "")} for it in faq.get("items", []) if isinstance(it, dict)
            ],
        }
        home_blocks.append(faq_block)

    cta = sections.get("cta")
    if isinstance(cta, dict):
        home_blocks.append(
            {
                "id": "blk_cta",
                "type": "cta",
                "enabled": cta.get("enabled", True),
                "heading": cta.get("heading", ""),
                "buttonText": cta.get("button_text", ""),
                "buttonHref": cta.get("button_href", ""),
            }
        )

    if home_blocks:
        pages["home"] = {"blocks": home_blocks}

    # Reuse the converted About/FAQ content on their dedicated pages so they're
    # populated rather than generic.
    if about_block is not None:
        pages["about"] = {"blocks": [{**about_block, "id": "blk_about_bio", "enabled": True}]}
    if faq_block is not None:
        pages["faq"] = {"blocks": [{**faq_block, "enabled": True}]}

    return pages
