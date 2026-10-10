"""Styled-section catalog: loaders over the synced manifest + the block cleaner.

The manifest lives in packages/shared/src/sections (source of truth) and is
copied into ``sections_manifest/`` by ``make sections-sync`` (``make lint``
fails on drift). Families own content schemas, styles own layouts:

    {"id": "blk_…", "type": "section.<family>", "variant": "<styleId>.<name>",
     "enabled": true, …family fields at top level…}

Pure Python (no Django, no model access) so ``defaults`` — which migrations
import — can derive KNOWN_BLOCK_TYPES from it.
"""

from __future__ import annotations

import html
import json
from functools import cache
from pathlib import Path

MANIFEST_DIR = Path(__file__).resolve().parent / "sections_manifest"
SECTION_PREFIX = "section."

_UNSAFE_URL_PREFIXES = ("javascript:", "data:", "vbscript:")
_LINK_MAX = 300
_IMAGE_KEYS = ("url", "photo_id", "alt")
_BASE_KEYS = ("id", "type", "variant", "enabled", "style")
_DROP = object()  # sentinel: omit the field


@cache
def manifest() -> dict:
    return json.loads((MANIFEST_DIR / "families.json").read_text())


def families() -> dict:
    """family id -> {label, kind, fields, …}."""
    return manifest()["families"]


@cache
def styles() -> dict:
    """style id -> SiteStyle dict, in display order. Empty when none ship yet."""
    found = []
    for path in sorted((MANIFEST_DIR / "styles").glob("*.json")):
        data = json.loads(path.read_text())
        found.append((data.get("order", 0), data.get("id") or path.stem, data))
    return {sid: data for _order, sid, data in sorted(found, key=lambda t: (t[0], t[1]))}


def enabled_styles() -> dict:
    return {sid: s for sid, s in styles().items() if s.get("enabled")}


def style(style_id) -> dict | None:
    return styles().get(str(style_id or ""))


def palettes(style_id) -> dict:
    """palette id -> variant for a style. The style's own palette is not
    listed: it is palette id "" everywhere."""
    return {p["id"]: p for p in (style(style_id) or {}).get("palettes") or [] if p.get("id")}


# A style's heroLayout as the coach reads it: looks sharing one are grouped.
HERO_LAYOUTS = {
    "split": "Headline beside a photo",
    "poster": "Giant type over a photo",
    "photo": "Photo first, words second",
    "arch": "Centred, with an arched photo",
    "titlepage": "A framed title page",
    "fullbleed": "Photo fills the page, words on a card",
    "collage": "A cluster of photos",
    "giant": "Giant headline, photos beneath",
    "cover": "A magazine cover",
    "centered": "Centred words, a band of photos",
}

# Photo slots (image, image2, image3, image4) a layout's first hero variant
# shows when it is not the usual two; the composer fetches no more than these.
HERO_PHOTOS = {"fullbleed": 1, "collage": 4, "giant": 3, "centered": 3}


def looks() -> list[dict]:
    """Every enabled style, in display order, with the colourways it offers:
    the looks /setup offers. "palettes" lists the style's own colours (id "")
    then its alternatives; the look the coach picks is "<style>" or
    "<style>:<palette>". "group" names the hero layout it shares with others."""
    return [
        {
            "value": sid,
            "style": sid,
            "palette": "",
            "label": s.get("label") or sid,
            "detail": s.get("mood", ""),
            "group": HERO_LAYOUTS.get(s.get("heroLayout") or "", ""),
            "tags": list(s.get("tags") or []),
            "palettes": [
                {"id": "", "label": s.get("paletteLabel") or "Original"},
                *[{"id": p["id"], "label": p.get("label") or p["id"]} for p in s.get("palettes") or []],
            ],
        }
        for sid, s in enabled_styles().items()
    ]


# Ranking weights, mirrored by rankStylesForNiche in packages/shared: the
# niche's position in a style's `niches` list (its first entry is the niche it
# is made for), plus a little for each tone the coach asked the site to have.
NICHE_WEIGHTS = (12, 8, 5, 3)
TONE_WEIGHT = 3


def tones_of(text) -> list[str]:
    """ "Warm, Calm" (the tone answer) -> ["warm", "calm"]."""
    return [t.strip().lower() for t in str(text or "").split(",") if t.strip()]


def rank_styles(niche, tones=()) -> list[dict]:
    """Enabled styles best first: niche fit, then tone match; ties keep the
    manifest order. A style with neither still ranks (the coach sees all)."""
    tones = {t.lower() for t in tones}

    def score(s):
        listed = s.get("niches") or []
        at = listed.index(niche) if niche in listed else None
        return (NICHE_WEIGHTS[min(at, len(NICHE_WEIGHTS) - 1)] if at is not None else 0) + TONE_WEIGHT * len(
            tones & set(s.get("tones") or [])
        )

    return sorted(enabled_styles().values(), key=lambda s: -score(s))  # sorted() is stable


def parse_look(value) -> tuple[str, str] | None:
    """ "journal" or "journal:sage" -> (style id, palette id) when both exist."""
    sid, _, pid = str(value or "").partition(":")
    if style(sid) is None or (pid and pid not in palettes(sid)):
        return None
    return sid, pid


def recipes(style_id) -> dict:
    """page key -> ordered ``family[:variant]`` entries: the manifest's recipes
    with any page the style orders itself (``style.recipes``) swapped in."""
    return {**manifest().get("recipes", {}), **((style(style_id) or {}).get("recipes") or {})}


# Photo slots a body layout never shows (by the style's bodyLayouts tag): no
# search, no download. A letter has no photo; a pull-quote keeps the portrait.
_BODY_UNSHOWN = {("story", "letter"): ("image", "image2"), ("story", "pull"): ("image2",)}
HERO_SLOTS = ("image", "image2", "image3", "image4")


def unshown_slots(family, variant) -> tuple[str, ...]:
    """Photo slots a layout ("<style>.<name>") never renders: the composer
    fetches none for them. Only a style's own first variant carries the
    layout it is tagged with; its older variants show what they always did."""
    style_id, _, name = str(variant or "").partition(".")
    if family == "hero":
        return HERO_SLOTS[hero_photos(variant) :]
    names = variants(style_id, family)
    layout = ((style(style_id) or {}).get("bodyLayouts") or {}).get(family)
    return _BODY_UNSHOWN.get((family, layout), ()) if names and name == names[0] else ()


def hero_photos(variant) -> int:
    """How many of the hero's photo slots a hero variant ("<style>.<name>")
    shows: one on the compact intro, the layout's count on the style's own
    first hero, two on any other."""
    style_id, _, name = str(variant or "").partition(".")
    names = variants(style_id, "hero")
    if name == "intro":
        return 1
    if names and name == names[0]:
        return HERO_PHOTOS.get((style(style_id) or {}).get("heroLayout"), 2)
    return 2


def variants(style_id, family) -> list[str]:
    """Variant names a style ships for a family; the first is its default."""
    return list(((style(style_id) or {}).get("variants") or {}).get(family) or [])


def family_of(block_type) -> str | None:
    """'section.hero' -> 'hero' for a known family, else None."""
    if not isinstance(block_type, str) or not block_type.startswith(SECTION_PREFIX):
        return None
    family = block_type[len(SECTION_PREFIX) :]
    return family if family in families() else None


def image_fields(family) -> tuple[str, ...]:
    """Top-level image fields of a family, main slot first ('image', 'image2')."""
    fields = (families().get(family) or {}).get("fields") or {}
    return tuple(name for name, spec in fields.items() if spec.get("type") == "image")


def resolve_variant(style_id, family, name) -> str | None:
    """'<style>.<name>' when the style ships that variant for the family, else
    the style's first variant for it; None when the style has none."""
    names = variants(style_id, family)
    if not names:
        return None
    return f"{style_id}.{name if name in names else names[0]}"


def restyle_variant(variant, target_style_id, family) -> str:
    """Map a block's variant onto another style: the same variant name when the
    target has it (keeps the compact hero "intro" an intro), else the same index
    within the family, else the target's first. Unmappable → unchanged."""
    target = variants(target_style_id, family)
    if not target:
        return variant
    source_style, _, name = str(variant or "").partition(".")
    if name in target:
        return f"{target_style_id}.{name}"
    source = variants(source_style, family)
    index = source.index(name) if name in source else 0
    # A hero that is not the compact intro never lands on the target's intro.
    pool = [n for n in target if n != "intro"] if family == "hero" and name != "intro" else target
    pool = pool or target
    return f"{target_style_id}.{pool[index] if index < len(pool) else pool[0]}"


def _has_photo(value) -> bool:
    return isinstance(value, dict) and bool(value.get("photo_id") or value.get("url"))


def restyle_pages(pages, target_style_id) -> dict:
    """New pages dict with every section block's variant mapped onto the target
    style. Content and images are untouched."""
    out = {}
    for key, page in (pages or {}).items():
        if not (isinstance(page, dict) and isinstance(page.get("blocks"), list)):
            out[key] = page
            continue
        blocks = []
        for block in page["blocks"]:
            family = family_of(block.get("type")) if isinstance(block, dict) else None
            if family:
                variant = restyle_variant(block.get("variant"), target_style_id, family)
                if _has_photo(block.get("image")) and "image" in unshown_slots(family, variant):
                    # A layout without a photo would hide the coach's own: take the target's next layout that shows it.
                    variant = next(
                        (
                            v
                            for n in variants(target_style_id, family)
                            if "image" not in unshown_slots(family, v := f"{target_style_id}.{n}")
                        ),
                        variant,
                    )
                block = {**block, "variant": variant}
            blocks.append(block)
        out[key] = {**page, "blocks": blocks}
    return out


# --- cleaning -----------------------------------------------------------------


def clamp_text(value, limit) -> str:
    """Plain text cut to ``limit`` chars on a word boundary (hard cut when a
    single word is longer than the limit). Non-strings become ""."""
    text = value if isinstance(value, str) else ""
    if len(text) <= limit:
        return text
    space = text.rfind(" ", 0, limit + 1)
    return (text[:space] if space > 0 else text[:limit]).rstrip()


def clamp_richtext(value, limit) -> str:
    """Rich text whose PLAIN-text length is within ``limit``: sanitized HTML
    kept as-is when it fits, else tags stripped and the text cut."""
    import nh3

    from .defaults import sanitize_rich_text  # function-local: defaults imports this module

    cleaned = sanitize_rich_text(value)
    plain = html.unescape(nh3.clean(cleaned, tags=set()))
    if len(plain) <= limit:
        return cleaned
    return html.escape(clamp_text(plain, limit), quote=False)


def _clean_link(value) -> str:
    href = value.strip() if isinstance(value, str) else ""
    return "" if href.lower().startswith(_UNSAFE_URL_PREFIXES) else href[:_LINK_MAX]


def _clean_image(value):
    if not isinstance(value, dict):
        return None
    out = {}
    for key in _IMAGE_KEYS:
        v = value.get(key)
        if v is None or isinstance(v, str):
            out[key] = v
    if isinstance(out.get("url"), str) and out["url"].strip().lower().startswith(_UNSAFE_URL_PREFIXES):
        out["url"] = None
    if isinstance(out.get("alt"), str):
        out["alt"] = out["alt"][:200]
    return out


def _clean_value(spec, value):
    """Cleaned value for one field, or ``_DROP`` to omit the field."""
    kind = spec.get("type")
    if kind == "text":
        return clamp_text(value, spec.get("max", 200))
    if kind == "richtext":
        return clamp_richtext(value, spec.get("max", 2000))
    if kind == "link":
        return _clean_link(value)
    if kind == "bool":
        if isinstance(value, str):
            return value.strip().lower() == "true"
        return bool(value)
    if kind == "select":
        options = [str(o) for o in spec.get("options") or []]
        v = str(value) if value is not None else ""
        if v in options:
            return v
        default = spec.get("default")
        return str(default) if default is not None else (options[0] if options else _DROP)
    if kind == "image":
        return _clean_image(value) or _DROP
    if kind == "items":
        if not isinstance(value, list):
            return _DROP
        item_fields = spec.get("fields") or {}
        return [_clean_fields(item_fields, item) for item in value[: spec.get("max", 12)] if isinstance(item, dict)]
    return _DROP


def _clean_fields(field_specs, raw) -> dict:
    out = {}
    for name, spec in field_specs.items():
        if name not in raw:
            continue
        value = _clean_value(spec, raw[name])
        if value is not _DROP:
            out[name] = value
    return out


def clean_section_block(block):
    """Shape a ``section.*`` block against its family schema: text clamped to
    its max on a word boundary, item lists capped (unknown item keys dropped),
    selects coerced to an allowed option, image dicts reduced to url/photo_id/
    alt, unknown keys dropped. Unknown family → None (drop the block). A
    variant of a known style resolves to one that style ships; a variant of an
    unknown style is kept as-is (the frontend falls back)."""
    if not isinstance(block, dict):
        return None
    family = family_of(block.get("type"))
    if family is None:
        return None
    out = {key: block[key] for key in _BASE_KEYS if key in block}
    if "enabled" in out:
        out["enabled"] = bool(out["enabled"])
    variant = block.get("variant")
    if isinstance(variant, str):
        style_id, _, name = variant.partition(".")
        out["variant"] = (resolve_variant(style_id, family, name) if style(style_id) else None) or variant[:80]
    else:
        out.pop("variant", None)
    out.update(_clean_fields(families()[family]["fields"], block))
    return out


SECTION_TYPES = frozenset(SECTION_PREFIX + family for family in families())
