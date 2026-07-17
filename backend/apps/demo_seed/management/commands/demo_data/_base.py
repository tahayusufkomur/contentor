"""Shared skeleton for the demo verticals. CONFIG_BASE holds every CONFIG
value identical across all 7 verticals; each vertical deep-merges its
overrides on top. Lists are atomic (replaced, never merged)."""

import copy


def deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


CONFIG_BASE: dict = {
    "dark_mode_enabled": True,
    "onboarding_completed": True,
    "enabled_modules": [
        "courses",
        "live",
        "community",
        "downloads",
        "billing",
        "campaigns",
        "analytics",
        "pages",
    ],
    "navbar_config": {
        "links": [
            {"label": "Courses", "href": "/courses"},
            {"label": "Live Classes", "href": "/events"},
            {"label": "Store", "href": "/store"},
            {"label": "About", "href": "/about"},
            {"label": "FAQ", "href": "/faq"},
        ],
        "cta": {"href": "/courses"},
        "show_login": True,
    },
    "landing_sections": {
        "hero": {
            "enabled": True,
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
        },
        "courses": {
            "enabled": True,
            "heading": "Featured Programs",
        },
        "testimonials": {
            "enabled": True,
            "heading": "What Students Say",
        },
        "faq": {
            "enabled": True,
            "heading": "Frequently Asked Questions",
        },
        "cta": {
            "enabled": True,
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}
