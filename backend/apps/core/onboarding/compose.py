"""Turn wizard answers into TenantConfig field values.

Called by provision_tenant AFTER the niche seeder ran: the seeder-merged
``landing_sections`` (niche copy + injected photo ids) is the raw material,
and everything returned here deliberately overrides what the seeder wrote.
Pure dict-in/dict-out; ``apply_wizard_logo`` (Task 8) is this module's only
model-touching function.

The strings below are tenant CONTENT (coach-editable after provisioning),
not UI chrome — that's why they live here and not in a frontend message
catalog. TR needs native review, same caveat as the signup email strings.
"""

from __future__ import annotations

from . import wizard_catalog

COPY = {
    "en": {
        "nav_courses": "Courses",
        "nav_events": "Events",
        "nav_store": "Store",
        "nav_pricing": "Pricing",
        "nav_about": "About",
        "nav_faq": "FAQ",
        "cta": "Get Started",
        "featured_courses": "Featured Courses",
        "all_courses": "All Courses",
        "events_heading": "Upcoming Events",
        "store_heading": "Downloads & Resources",
        "testimonials_heading": "What students say",
        "faq_heading": "Frequently asked questions",
        "cta_heading": "Ready to start learning?",
        "cta_button": "Join Now",
        "plans_heading": "Plans & Pricing",
        "plans_subheading": "Choose a plan that fits your goals.",
        "about_heading": "About",
        "intro_heading": "Welcome",
        "intro_body": "Take a look around and find what fits you.",
        "contact_heading": "Get in touch",
        "contact_intro": "Have a question? Send us a message.",
        "contact_submit": "Send message",
        "contact_success": "Thanks! We'll get back to you soon.",
    },
    "tr": {
        "nav_courses": "Kurslar",
        "nav_events": "Etkinlikler",
        "nav_store": "Mağaza",
        "nav_pricing": "Planlar",
        "nav_about": "Hakkımda",
        "nav_faq": "SSS",
        "cta": "Hemen Başla",
        "featured_courses": "Öne Çıkan Kurslar",
        "all_courses": "Tüm Kurslar",
        "events_heading": "Yaklaşan Etkinlikler",
        "store_heading": "İndirilebilir Kaynaklar",
        "testimonials_heading": "Öğrenciler ne diyor",
        "faq_heading": "Sıkça sorulan sorular",
        "cta_heading": "Başlamaya hazır mısın?",
        "cta_button": "Hemen Katıl",
        "plans_heading": "Planlar ve Fiyatlar",
        "plans_subheading": "Hedeflerine uygun bir plan seç.",
        "about_heading": "Hakkımda",
        "intro_heading": "Hoş geldin",
        "intro_body": "Etrafa göz at ve sana uygun olanı bul.",
        "contact_heading": "İletişime geç",
        "contact_intro": "Bir sorun mu var? Bize mesaj gönder.",
        "contact_submit": "Mesaj gönder",
        "contact_success": "Teşekkürler! En kısa sürede dönüş yapacağız.",
    },
}

# courses/billing/pages/analytics are platform core — always on (the setup
# assistant and the default admin nav assume them). Goals add the rest.
ALWAYS_MODULES = ("analytics", "billing", "courses", "pages")
GOAL_MODULES = {
    "run_live_classes": ("live",),
    "in_person_events": ("live",),
    "sell_downloads": ("downloads",),
    "email_marketing": ("campaigns",),
    "build_community": ("community",),
}


def _t(locale: str) -> dict:
    return COPY["tr" if locale == "tr" else "en"]


def _img(url=None, photo_id=None) -> dict:
    return {"url": url or None, "photo_id": str(photo_id) if photo_id else None}


def build_config_overrides(answers: dict, *, brand_name: str, landing_sections: dict, locale: str = "en") -> dict:
    answers = answers or {}
    sections = landing_sections or {}
    goals = [g for g in (answers.get("goals") or []) if g in wizard_catalog.GOALS]
    copy = _t(locale)

    links = [{"label": copy["nav_courses"], "href": "/courses"}]
    if "run_live_classes" in goals or "in_person_events" in goals:
        links.append({"label": copy["nav_events"], "href": "/events"})
    if "sell_downloads" in goals:
        links.append({"label": copy["nav_store"], "href": "/store"})
    if "sell_courses" in goals or "sell_downloads" in goals:
        links.append({"label": copy["nav_pricing"], "href": "/plans"})
    links.append({"label": copy["nav_about"], "href": "/about"})
    links.append({"label": copy["nav_faq"], "href": "/faq"})

    modules = set(ALWAYS_MODULES)
    for goal in goals:
        modules.update(GOAL_MODULES.get(goal, ()))

    return {
        "theme": answers.get("theme") or "ocean",
        "font_family": answers.get("font_family") or "Inter",
        "navbar_config": {
            "links": links,
            "cta": {"text": copy["cta"], "href": "/courses"},
            "show_login": True,
            "layout": answers.get("navbar_layout") or "classic",
        },
        "enabled_modules": sorted(modules),
        "pages": _build_pages(answers, brand_name=brand_name, sections=sections, goals=goals, copy=copy),
    }


# --- page builders -----------------------------------------------------------


def _hero(answers, brand_name, sections) -> dict:
    hero = sections.get("hero") or {}
    style = answers.get("hero_style") or "centered"
    bg = _img() if style == "minimal" else _img(hero.get("bg_image_url"), hero.get("bg_image_photo_id"))
    welcome = f"Welcome to {brand_name}" if brand_name else "Welcome"
    return {
        "id": "blk_hero",
        "type": "hero",
        "enabled": True,
        "layout": style,
        "heading": hero.get("headline") or welcome,
        "subheading": hero.get("subheadline") or "",
        "ctaText": hero.get("cta_text") or "",
        "ctaHref": hero.get("cta_href") or "/courses",
        "bgImage": bg,
        "overlay": "dark",
        "overlayStrength": "medium",
    }


def _about_image_text(sections, copy, block_id="blk_about") -> dict:
    about = sections.get("about") or {}
    return {
        "id": block_id,
        "type": "imageText",
        "enabled": True,
        "heading": about.get("heading") or copy["about_heading"],
        "body": about.get("body") or "",
        "image": _img(about.get("image_url"), about.get("image_photo_id")),
        "imagePosition": "right",
    }


def _course_grid(copy, heading_key, block_id="blk_courses") -> dict:
    return {"id": block_id, "type": "courseGrid", "enabled": True, "heading": copy[heading_key]}


def _testimonials(sections, copy) -> dict:
    items = [
        {
            "name": it.get("name", ""),
            "text": it.get("text", ""),
            "avatar": _img(it.get("avatar_url"), it.get("avatar_photo_id")),
        }
        for it in (sections.get("testimonials") or {}).get("items", [])
        if isinstance(it, dict)
    ]
    return {
        "id": "blk_testimonials",
        "type": "testimonials",
        "enabled": bool(items),
        "heading": (sections.get("testimonials") or {}).get("heading") or copy["testimonials_heading"],
        "items": items,
    }


def _faq(sections, copy, block_id="blk_faq") -> dict:
    items = [
        {"q": it.get("q", ""), "a": it.get("a", "")}
        for it in (sections.get("faq") or {}).get("items", [])
        if isinstance(it, dict)
    ]
    return {"id": block_id, "type": "faq", "enabled": True, "heading": copy["faq_heading"], "items": items}


def _cta(sections, copy, block_id="blk_cta") -> dict:
    cta = sections.get("cta") or {}
    return {
        "id": block_id,
        "type": "cta",
        "enabled": True,
        "heading": cta.get("heading") or copy["cta_heading"],
        "buttonText": cta.get("button_text") or copy["cta_button"],
        "buttonHref": cta.get("button_href") or "/courses",
    }


def _intro(copy, block_id="blk_intro") -> dict:
    return {
        "id": block_id,
        "type": "richText",
        "enabled": True,
        "heading": copy["intro_heading"],
        "body": copy["intro_body"],
    }


def _goal_blocks(goals, copy) -> list[dict]:
    blocks, seen = [], set()
    for entry in wizard_catalog.HOME_GOAL_BLOCKS:
        if entry["goal"] in goals and entry["type"] not in seen:
            seen.add(entry["type"])
            heading = copy["events_heading"] if entry["type"] == "upcomingEvents" else copy["store_heading"]
            blocks.append(
                {"id": f"blk_{entry['type'].lower()}", "type": entry["type"], "enabled": True, "heading": heading}
            )
    return blocks


def _build_pages(answers, *, brand_name, sections, goals, copy) -> dict:
    chosen = answers.get("page_layouts") or {}

    def layout(page):
        wanted = chosen.get(page)
        valid = {o["id"] for o in wizard_catalog.PAGE_LAYOUTS[page]}
        return wanted if wanted in valid else wizard_catalog.PAGE_LAYOUTS[page][0]["id"]

    home = [_hero(answers, brand_name, sections)]
    if layout("home") == "home-story":
        home += [
            _about_image_text(sections, copy),
            _course_grid(copy, "featured_courses"),
            *_goal_blocks(goals, copy),
            _faq(sections, copy),
            _cta(sections, copy),
        ]
    else:  # home-spotlight
        home += [
            _course_grid(copy, "featured_courses"),
            *_goal_blocks(goals, copy),
            _testimonials(sections, copy),
            _cta(sections, copy),
        ]

    if layout("about") == "about-portrait":
        about = [
            _about_image_text(sections, copy, "blk_about_bio"),
            _testimonials(sections, copy),
            _cta(sections, copy),
        ]
    else:  # about-story
        about = [_intro(copy, "blk_about_intro"), _about_image_text(sections, copy, "blk_about_bio")]

    courses = [_course_grid(copy, "all_courses", "blk_courses_grid")]
    if layout("courses") == "courses-guided":
        courses = [_intro(copy), *courses, _cta(sections, copy)]

    pricing = [
        {
            "id": "blk_pricing_plans",
            "type": "pricingPlans",
            "enabled": True,
            "heading": copy["plans_heading"],
            "subheading": copy["plans_subheading"],
        }
    ]
    if layout("pricing") == "pricing-reassure":
        pricing += [_faq(sections, copy, "blk_pricing_faq"), _cta(sections, copy, "blk_pricing_cta")]

    faq_page = [_faq(sections, copy)]
    if layout("faq") == "faq-welcoming":
        faq_page = [_intro(copy), *faq_page, _cta(sections, copy)]

    contact_block = {
        "id": "blk_contact",
        "type": "contact",
        "enabled": True,
        "heading": copy["contact_heading"],
        "intro": copy["contact_intro"],
        "submitLabel": copy["contact_submit"],
        "successMessage": copy["contact_success"],
    }
    contact = [contact_block]
    if layout("contact") == "contact-warm":
        contact = [_intro(copy), contact_block]

    return {
        "home": {"blocks": home},
        "about": {"blocks": about},
        "courses": {"blocks": courses},
        "pricing": {"blocks": pricing},
        "faq": {"blocks": faq_page},
        "contact": {"blocks": contact},
    }


def apply_wizard_logo(config, answers, tenant) -> None:
    """Apply the wizard's logo choice. Runs inside tenant_context; the caller
    saves ``config``.

    wordmark: store nothing — with no logo image the public header renders
    the brand name as text, which IS the wordmark door's promise.
    ai: AI Brand Pack — persist the composer's recipe (re-validated
    defensively, same validator the wizard-answers check and the Logo Studio
    serializer use) and attach the staged PNG exports. export_keys are
    trusted ONLY when they equal this tenant's own staged path
    (``wizard/<schema_name>/logo.png`` / ``.../icon.png``) — anything else
    (forged, stale, or another tenant's key) is silently dropped rather than
    attached. show_brand_name is off: studio lockups already contain the
    wordmark, same reasoning the Logo Studio's own help text gives.
    curated: tenant Photo row pointing at the shared platform/ key (demo-photo
    precedent; no S3 copy, DB-only erase can't orphan it) + show_brand_name
    so mark + brand text form a lockup. Idempotent via the s3_key lookup.
    """
    logo = answers.get("logo") or {}
    mode = logo.get("mode")

    if mode == "ai" and isinstance(logo.get("recipe"), dict) and tenant.has_paid_platform_plan:
        from apps.tenant_config import logo_recipe as logo_recipe_lib

        try:
            config.logo_recipe = logo_recipe_lib.validate_recipe(logo_recipe_lib.upgrade_recipe(logo["recipe"]))
        except Exception:
            return  # invalid recipe -> behave like wordmark (text fallback)

        from apps.media.models import Photo

        expected = {kind: f"wizard/{tenant.schema_name}/{kind}.png" for kind in ("logo", "icon")}
        export_keys = logo.get("export_keys") or {}
        for kind, expected_key in expected.items():
            if export_keys.get(kind) != expected_key:
                continue  # ownership re-check: only this tenant's staged keys
            photo = Photo.objects.filter(s3_key=expected_key).first()
            if photo is None:
                photo = Photo.objects.create(s3_key=expected_key, title=kind.capitalize())
            setattr(config, kind, photo)
        config.logo_url = ""
        navbar = dict(config.navbar_config or {})
        navbar["show_brand_name"] = False  # studio lockups already contain the wordmark
        config.navbar_config = navbar
        return

    if mode != "curated" or not logo.get("curated_id"):
        return

    from django_tenants.utils import schema_context

    from apps.core.models import CuratedLogo

    with schema_context("public"):
        row = CuratedLogo.objects.filter(id=logo["curated_id"], enabled=True).first()
        image_key = row.image_key if row else ""
    if not image_key.startswith("platform/"):
        return

    from apps.media.models import Photo

    photo = Photo.objects.filter(s3_key=image_key).first()
    if photo is None:
        photo = Photo.objects.create(s3_key=image_key, title="Logo")
    config.logo = photo
    config.logo_url = ""
    navbar = dict(config.navbar_config or {})
    navbar["show_brand_name"] = True
    config.navbar_config = navbar
