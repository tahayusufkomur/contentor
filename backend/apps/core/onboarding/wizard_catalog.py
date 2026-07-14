"""Option catalog for the pre-provision onboarding wizard.

Single source of truth for every answer the wizard may store: option ids,
per-niche theme ranking, page-layout block sequences, and the recommended
default per step. Pure data + helpers (no model access) so it's importable
from views, Celery tasks, and tests alike.

The frontend renders steps from GET /api/v1/onboarding/wizard/catalog/ and
never hardcodes option ids; ``validate_answers`` is the write-side gate.
Labels are deliberately NOT here — they live in the frontend message
catalogs (messages/{en,tr}/wizard.json) to keep the i18n parity guard the
single translation workflow.
"""

from __future__ import annotations

from apps.tenant_config.defaults import KNOWN_PAGE_KEYS

GOALS = (
    "sell_courses",
    "run_live_classes",
    "in_person_events",
    "sell_downloads",
    "email_marketing",
    "build_community",
)

THEMES = ("ocean", "ember", "forest", "sunset", "violet", "slate")

# First entry = the niche module's own theme (demo_data/<niche>.py CONFIG),
# then two curated complements. The wizard shows these three first.
THEME_RANKING = {
    "yoga": ("forest", "slate", "violet"),
    "pilates": ("slate", "ocean", "forest"),
    "fitness": ("ember", "ocean", "slate"),
    "pole_dance": ("violet", "sunset", "slate"),
    "belly_dance": ("sunset", "violet", "ember"),
    "face_yoga": ("sunset", "forest", "violet"),
    "makeup": ("violet", "sunset", "slate"),
    "general": ("ocean", "forest", "slate"),
}

# Wizard font ids -> the TenantConfig.font_family value stored. Mirrors the
# post-launch coach admin's font picker (frontend-customer brand-tab.tsx
# FONTS) — same 8 families, so what a coach can pick in the wizard is a
# subset-turned-superset match of what they can switch to later. The
# customer frontend loads font_family dynamically via Google Fonts (see
# frontend-customer/src/app/layout.tsx), so any of these renders correctly
# on the live site without further plumbing.
FONTS = {
    "inter": "Inter",
    "geist": "Geist",
    "poppins": "Poppins",
    "nunito": "Nunito",
    "dm_sans": "DM Sans",
    "playfair": "Playfair Display",
    "merriweather": "Merriweather",
    "lora": "Lora",
}

_RECOMMENDED_FONT = {
    "yoga": "Nunito",
    "face_yoga": "Nunito",
    "belly_dance": "Playfair Display",
    "pole_dance": "Playfair Display",
    "makeup": "Playfair Display",
}

NAVBAR_LAYOUTS = ("classic", "centered", "minimal")  # wizard subset of the 5 presets

HERO_STYLES = ("centered", "split", "minimal")  # == hero block "layout" enum

LOGO_MODES = ("wordmark", "curated", "ai")

# Per-page layout options. "blocks" is the block-TYPE sequence the layout
# seeds (compose.py builds the actual block dicts); the frontend draws its
# thumbnail skeletons from the same sequence. First option = recommended.
PAGE_LAYOUTS = {
    "home": (
        {"id": "home-spotlight", "blocks": ("hero", "courseGrid", "testimonials", "cta")},
        {"id": "home-story", "blocks": ("hero", "imageText", "courseGrid", "faq", "cta")},
    ),
    "about": (
        {"id": "about-story", "blocks": ("richText", "imageText")},
        {"id": "about-portrait", "blocks": ("imageText", "testimonials", "cta")},
    ),
    "courses": (
        {"id": "courses-grid", "blocks": ("courseGrid",)},
        {"id": "courses-guided", "blocks": ("richText", "courseGrid", "cta")},
    ),
    "pricing": (
        {"id": "pricing-simple", "blocks": ("pricingPlans",)},
        {"id": "pricing-reassure", "blocks": ("pricingPlans", "faq", "cta")},
    ),
    "faq": (
        {"id": "faq-list", "blocks": ("faq",)},
        {"id": "faq-welcoming", "blocks": ("richText", "faq", "cta")},
    ),
    "contact": (
        {"id": "contact-form", "blocks": ("contact",)},
        {"id": "contact-warm", "blocks": ("richText", "contact")},
    ),
}

# Appended to the home page (after courseGrid) only when the goal is picked.
HOME_GOAL_BLOCKS = (
    {"goal": "run_live_classes", "type": "upcomingEvents"},
    {"goal": "in_person_events", "type": "upcomingEvents"},
    {"goal": "sell_downloads", "type": "storeProducts"},
)

DESCRIPTION_MAX_LEN = 500


def _layout_ids(page: str) -> set[str]:
    return {option["id"] for option in PAGE_LAYOUTS[page]}


def recommended_answers(niche: str) -> dict:
    """Complete default answer set for a niche — what "finish the rest for
    me" and finalize-with-gaps apply. Unknown niches fall back to general."""
    niche = niche if niche in THEME_RANKING else "general"
    return {
        "niche": niche,
        "description": "",
        "goals": ["sell_courses"],
        "theme": THEME_RANKING[niche][0],
        "font_family": _RECOMMENDED_FONT.get(niche, "Inter"),
        "navbar_layout": "classic",
        "hero_style": "centered",
        "page_layouts": {page: options[0]["id"] for page, options in PAGE_LAYOUTS.items()},
        "logo": {"mode": "wordmark", "curated_id": None},
    }


def validate_answers(partial: dict) -> list[str]:
    """Human-readable errors for any invalid key/value; [] = valid.

    Unknown keys are errors, not ignored: the client is generated from this
    catalog, so drift means a bug (or a probe) and must not be stored.
    """
    errors: list[str] = []
    for key, value in partial.items():
        if key == "niche":
            from apps.core.demo.seed_template import available_niches

            if value not in available_niches():
                errors.append(f"unknown niche '{value}'")
        elif key == "description":
            if not isinstance(value, str) or len(value) > DESCRIPTION_MAX_LEN:
                errors.append(f"description must be a string of at most {DESCRIPTION_MAX_LEN} characters")
        elif key == "goals":
            if not isinstance(value, list) or not all(isinstance(g, str) and g in GOALS for g in value):
                errors.append("goals must be a list of known goal keys")
        elif key == "theme":
            if value not in THEMES:
                errors.append(f"unknown theme '{value}'")
        elif key == "font_family":
            if value not in FONTS.values():
                errors.append(f"unknown font '{value}'")
        elif key == "navbar_layout":
            if value not in NAVBAR_LAYOUTS:
                errors.append(f"unknown navbar layout '{value}'")
        elif key == "hero_style":
            if value not in HERO_STYLES:
                errors.append(f"unknown hero style '{value}'")
        elif key == "page_layouts":
            if not isinstance(value, dict):
                errors.append("page_layouts must be an object")
                continue
            for page, layout_id in value.items():
                if page not in KNOWN_PAGE_KEYS:
                    errors.append(f"unknown page '{page}'")
                elif layout_id not in _layout_ids(page):
                    errors.append(f"unknown layout '{layout_id}' for page '{page}'")
        elif key == "logo":
            if not isinstance(value, dict) or value.get("mode") not in LOGO_MODES:
                errors.append("logo.mode must be one of: " + ", ".join(LOGO_MODES))
                continue
            mode = value["mode"]
            if mode == "curated" and not isinstance(value.get("curated_id"), int):
                errors.append("logo.curated_id must be an integer for curated mode")
            if value.get("curated_id") is not None and not isinstance(value.get("curated_id"), int):
                errors.append("logo.curated_id must be an integer or null")
            recipe = value.get("recipe")
            if mode == "ai":
                if not isinstance(recipe, dict):
                    errors.append("logo.recipe is required for ai mode")
                else:
                    from apps.tenant_config import logo_recipe as logo_recipe_lib

                    try:
                        logo_recipe_lib.validate_recipe(logo_recipe_lib.upgrade_recipe(recipe))
                    except Exception:
                        errors.append("logo.recipe failed validation")
                export_keys = value.get("export_keys")
                if export_keys is not None:
                    if not isinstance(export_keys, dict) or set(export_keys) != {"logo", "icon"}:
                        errors.append("logo.export_keys must be {logo, icon}")
                    elif not all(isinstance(k, str) and k.startswith("wizard/") for k in export_keys.values()):
                        errors.append("logo.export_keys must live under wizard/")
            elif recipe is not None:
                errors.append("logo.recipe is only allowed for ai mode")
        else:
            errors.append(f"unknown answer key '{key}'")
    return errors


def catalog_payload() -> dict:
    """JSON-safe catalog served by GET /api/v1/onboarding/wizard/catalog/."""
    from apps.core.demo.seed_template import available_niches

    return {
        "niches": available_niches(),
        "goals": list(GOALS),
        "themes": list(THEMES),
        "theme_ranking": {niche: list(ranked) for niche, ranked in THEME_RANKING.items()},
        "fonts": dict(FONTS),
        "navbar_layouts": list(NAVBAR_LAYOUTS),
        "hero_styles": list(HERO_STYLES),
        "logo_modes": list(LOGO_MODES),
        "page_layouts": {
            page: [{"id": o["id"], "blocks": list(o["blocks"])} for o in options]
            for page, options in PAGE_LAYOUTS.items()
        },
        "home_goal_blocks": [dict(b) for b in HOME_GOAL_BLOCKS],
        "description_max_len": DESCRIPTION_MAX_LEN,
        "recommended": recommended_answers("general"),
    }
