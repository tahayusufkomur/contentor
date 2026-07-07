from uuid import uuid4

from django.conf import settings
from django.db import connection
from rest_framework import serializers

from apps.core.storage import generate_presigned_download_url, sign_if_s3_key

from .defaults import (
    KNOWN_BLOCK_TYPES,
    KNOWN_PAGE_KEYS,
    RICH_TEXT_FIELDS,
    pages_from_landing_sections,
    sanitize_block_style,
    sanitize_rich_text,
)
from .models import TenantConfig, TenantTheme

# href/url string values starting with these schemes are stripped on write —
# defence-in-depth against javascript: navigation injected via the builder.
_UNSAFE_URL_PREFIXES = ("javascript:", "vbscript:")

# Navbar layout presets the public header can render.
_NAVBAR_LAYOUTS = {"classic", "centered", "split", "minimal", "pill"}


def _clean_nav_href(href):
    href = str(href or "")
    if href.strip().lower().startswith(_UNSAFE_URL_PREFIXES):
        return ""
    return href[:300]


class TenantConfigSerializer(serializers.ModelSerializer):
    def validate_theme(self, value):
        if value not in TenantTheme.values:
            raise serializers.ValidationError("Theme must be one of the curated theme IDs.")
        return value

    def validate_navbar_config(self, value):
        """Shape the navbar payload: layout enum, capped link/cta strings,
        unsafe URL schemes stripped, booleans coerced. Same defence-in-depth
        the serializer applies to ``pages``.
        """
        if not isinstance(value, dict):
            raise serializers.ValidationError("navbar_config must be an object.")
        cleaned = dict(value)
        layout = cleaned.get("layout") or "classic"
        if layout not in _NAVBAR_LAYOUTS:
            raise serializers.ValidationError(
                "layout must be one of: " + ", ".join(sorted(_NAVBAR_LAYOUTS)) + "."
            )
        cleaned["layout"] = layout
        links = []
        for raw in (cleaned.get("links") or [])[:20]:
            if not isinstance(raw, dict):
                continue
            links.append(
                {"label": str(raw.get("label") or "")[:80], "href": _clean_nav_href(raw.get("href"))}
            )
        cleaned["links"] = links
        cta = cleaned.get("cta")
        if isinstance(cta, dict):
            cleaned["cta"] = {"text": str(cta.get("text") or "")[:80], "href": _clean_nav_href(cta.get("href"))}
        else:
            cleaned["cta"] = None
        cleaned["show_login"] = bool(cleaned.get("show_login", True))
        cleaned["show_install"] = bool(cleaned.get("show_install", True))
        cleaned["transparent_over_hero"] = bool(cleaned.get("transparent_over_hero", False))
        return cleaned

    def validate_pages(self, value):
        """Defensively shape the builder payload: only known pages/blocks,
        each block gets a string id and an ``enabled`` flag, its optional style
        override is clamped, and unsafe URLs are stripped. Permissive on extra
        fields (forward-compat with the frontend).
        """
        if not isinstance(value, dict):
            raise serializers.ValidationError("pages must be an object.")
        cleaned = {}
        for page_key, page in value.items():
            if page_key not in KNOWN_PAGE_KEYS or not isinstance(page, dict):
                continue
            blocks = [b for b in (_clean_block(raw) for raw in page.get("blocks", []) or []) if b is not None]
            cleaned[page_key] = {"blocks": blocks}
        return cleaned

    def validate_page_templates(self, value):
        """Shape coach-saved page templates exactly like live pages: known
        block types only, string ids, clamped styles, unsafe URLs stripped.
        Capped to keep the config payload bounded.
        """
        if not isinstance(value, list):
            raise serializers.ValidationError("page_templates must be a list.")
        cleaned = []
        for tmpl in value[:50]:
            if not isinstance(tmpl, dict):
                continue
            tid = tmpl.get("id")
            if not isinstance(tid, str) or not tid:
                tid = f"tmpl_{uuid4().hex[:8]}"
            blocks = [b for b in (_clean_block(raw) for raw in tmpl.get("blocks", []) or []) if b is not None]
            cleaned.append(
                {
                    "id": tid,
                    "name": str(tmpl.get("name") or "Untitled")[:120],
                    "category": str(tmpl.get("category") or "")[:40],
                    "blocks": blocks,
                }
            )
        return cleaned

    class Meta:
        model = TenantConfig
        fields = [
            "id",
            "brand_name",
            "logo_url",
            "logo_id",
            "theme",
            "dark_mode_enabled",
            "font_family",
            "custom_css",
            "enabled_modules",
            "social_links",
            "meta_description",
            "navbar_config",
            "landing_sections",
            "pages",
            "page_templates",
            "timezone",
            "onboarding_completed",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Prefer logo FK over logo_url string
        if instance.logo_id and instance.logo and instance.logo.s3_key:
            data["logo_url"] = generate_presigned_download_url(instance.logo.s3_key)
        else:
            data["logo_url"] = sign_if_s3_key(data.get("logo_url"))
        # Sign image URLs inside landing_sections (legacy) and pages (builder).
        sections = data.get("landing_sections")
        if isinstance(sections, dict):
            self._sign_landing_section_photos(sections)
        # Fall back to deriving pages from the legacy landing_sections when a
        # tenant has none yet (freshly-seeded demos, not-yet-migrated tenants).
        pages = data.get("pages")
        if not pages:
            pages = pages_from_landing_sections(instance.landing_sections or {}, instance.brand_name)
            data["pages"] = pages
        if isinstance(pages, dict):
            self._sign_tree(pages)
        # Saved page templates capture the coach's real images — re-sign them too.
        templates = data.get("page_templates")
        if isinstance(templates, list):
            self._sign_tree(templates)
        # Tenant metadata — read directly from the active tenant row so the
        # frontend knows whether to render the demo banner without a second
        # round-trip.
        tenant = getattr(connection, "tenant", None)
        if tenant is not None:
            slug = tenant.slug or ""
            data["is_demo"] = bool(getattr(tenant, "is_demo", False))
            # Whether demo read-only enforcement is active. Off locally so the
            # frontend can hide the demo banner and allow editing while testing.
            data["demo_readonly"] = bool(getattr(settings, "DEMO_READONLY_ENABLED", True))
            data["tenant_name"] = tenant.name
            data["tenant_slug"] = slug
            data["demo_niche"] = slug[len("demo-") :] if slug.startswith("demo-") else ""
            # Unified niche: prefer the real-tenant template niche, fall back to
            # the demo niche. Read-only — the builder uses it to seed new blocks
            # with niche-appropriate example content.
            data["niche"] = getattr(tenant, "template_niche", "") or data["demo_niche"]
            # Publish gate: the customer app hides the site behind a preview
            # gate when it isn't published (owners + valid preview cookie pass).
            data["is_published"] = bool(getattr(tenant, "is_published", True))
            data["has_preview_password"] = bool(getattr(tenant, "preview_password", ""))
        return data

    def _sign_landing_section_photos(self, sections):
        from apps.media.models import Photo

        # Collect all photo IDs for bulk query
        photo_ids = []
        for section_data in sections.values():
            if isinstance(section_data, dict):
                for key in ("bg_image_photo_id", "image_photo_id"):
                    pid = section_data.get(key)
                    if pid:
                        photo_ids.append(pid)

        # Bulk fetch photos
        photo_map = {}
        if photo_ids:
            for photo in Photo.objects.filter(pk__in=photo_ids):
                photo_map[str(photo.pk)] = photo

        # Sign URLs and resolve photo IDs
        for section_data in sections.values():
            if isinstance(section_data, dict):
                # Sign legacy string URLs
                for key in ("bg_image_url", "image_url"):
                    if key in section_data:
                        section_data[key] = sign_if_s3_key(section_data[key])
                # Override with Photo FK if present
                for photo_key, url_key in (
                    ("bg_image_photo_id", "bg_image_url"),
                    ("image_photo_id", "image_url"),
                ):
                    pid = section_data.get(photo_key)
                    if pid and str(pid) in photo_map:
                        photo = photo_map[str(pid)]
                        section_data[url_key] = generate_presigned_download_url(photo.s3_key)

    def _sign_tree(self, node):
        """Re-sign every asset URL anywhere in a builder tree.

        Builder blocks store image fields as ``{"url", "photo_id"}`` and video
        fields as ``{"url", "video_id"}``. Presigned URLs expire, so on every
        read we re-derive ``url`` from the referenced asset. One bulk query per
        asset type (no N+1) regardless of how many blocks reference them. Works
        on any node — the ``pages`` dict or the ``page_templates`` list — since
        the collectors/signers recurse over both dicts and lists.
        """
        photo_ids: set[str] = set()
        video_ids: set[str] = set()
        _collect_asset_ids(node, photo_ids, video_ids)

        photo_map = {}
        if photo_ids:
            from apps.media.models import Photo

            for photo in Photo.objects.filter(pk__in=photo_ids):
                photo_map[str(photo.pk)] = photo.s3_key

        video_map = {}
        if video_ids:
            from apps.courses.models import Video

            for video in Video.objects.filter(pk__in=video_ids):
                video_map[str(video.pk)] = video.s3_key

        _sign_assets(node, photo_map, video_map)


def _clean_block(raw):
    """Defensively shape one builder block: known type, string id, ``enabled``
    flag, clamped ``style`` override, unsafe URLs stripped. Returns the cleaned
    block dict, or ``None`` if it should be dropped (missing/unknown type).

    Shared by ``validate_pages`` and ``validate_page_templates`` so live pages
    and saved templates are sanitised identically.
    """
    if not isinstance(raw, dict) or raw.get("type") not in KNOWN_BLOCK_TYPES:
        return None
    block = dict(raw)
    if not isinstance(block.get("id"), str) or not block["id"]:
        block["id"] = f"blk_{uuid4().hex[:8]}"
    block.setdefault("enabled", True)
    style = sanitize_block_style(block["type"], block.get("style"))
    if style:
        block["style"] = style
    else:
        block.pop("style", None)
    for field in RICH_TEXT_FIELDS:
        if isinstance(block.get(field), str):
            block[field] = sanitize_rich_text(block[field])
    _scrub_unsafe_urls(block)
    return block


def _collect_asset_ids(node, photo_ids, video_ids):
    if isinstance(node, dict):
        if node.get("photo_id"):
            photo_ids.add(str(node["photo_id"]))
        if node.get("video_id"):
            video_ids.add(str(node["video_id"]))
        for value in node.values():
            _collect_asset_ids(value, photo_ids, video_ids)
    elif isinstance(node, list):
        for item in node:
            _collect_asset_ids(item, photo_ids, video_ids)


def _sign_assets(node, photo_map, video_map):
    if isinstance(node, dict):
        if "photo_id" in node:
            pid = node.get("photo_id")
            if pid and str(pid) in photo_map:
                node["url"] = generate_presigned_download_url(photo_map[str(pid)])
            elif node.get("url"):
                node["url"] = sign_if_s3_key(node["url"])
        if "video_id" in node:
            vid = node.get("video_id")
            if vid and str(vid) in video_map:
                node["url"] = sign_if_s3_key(video_map[str(vid)])
            elif node.get("url"):
                node["url"] = sign_if_s3_key(node["url"])
        for value in node.values():
            _sign_assets(value, photo_map, video_map)
    elif isinstance(node, list):
        for item in node:
            _sign_assets(item, photo_map, video_map)


def _scrub_unsafe_urls(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if (
                isinstance(value, str)
                and (key.endswith("href") or key.endswith("url") or key.endswith("Href"))
                and value.strip().lower().startswith(_UNSAFE_URL_PREFIXES)
            ):
                node[key] = ""
            else:
                _scrub_unsafe_urls(value)
    elif isinstance(node, list):
        for item in node:
            _scrub_unsafe_urls(item)
