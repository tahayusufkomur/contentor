"""Copilot endpoint pair. Coach-JWT (DRF default auth + IsCoachOrOwner — do
NOT clear authentication_classes; that is only for pre-provision wizard
endpoints). No metering: no availability checks, no credits. Every model
call's USD still lands in the onboarding meter (kill-switch integrity)."""

import logging
from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django_tenants.utils import tenant_context
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from apps.core import ai as core_ai
from apps.core.ai_sse import EventStreamRenderer, sse_frame, stream_response
from apps.core.copilot import blocks, chrome, content, engine, logos, photos, tokens
from apps.core.copilot.tokens import ActionTokenError
from apps.core.onboarding import ai_compose, site_ai
from apps.core.permissions import IsCoachOrOwner

logger = logging.getLogger(__name__)

MESSAGE_MAX_LEN = 2000
MAX_ATTACHED_PHOTOS = 3

SELECTION_CAPS = {"path": 200, "block_id": 40, "tag": 40, "text": 200, "context": 120}


def _clean_selections(raw):
    cleaned = []
    for item in raw[:5]:
        if not isinstance(item, dict):
            continue
        cleaned.append({k: str(item.get(k) or "")[:cap] for k, cap in SELECTION_CAPS.items()})
    return cleaned


def _clean_attachments(tenant, raw):
    """Coach-attached photo ids from the composer → verified tenant Photo
    rows for the user turn. Unknown ids are dropped silently (the upload
    already succeeded or the coach never saw a chip); the model only ever
    hears about photos that really exist in this tenant's library."""
    from apps.media.models import Photo

    if not isinstance(raw, list):
        return []
    ids = [str(item) for item in raw[:MAX_ATTACHED_PHOTOS] if isinstance(item, str | int)]
    if not ids:
        return []
    with tenant_context(tenant):
        rows = list(Photo.objects.filter(pk__in=ids).values("id", "title", "alt_text"))
    return [{"id": str(r["id"]), "title": r["title"], "desc": r["alt_text"]} for r in rows]


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@renderer_classes([JSONRenderer, EventStreamRenderer])
def copilot_converse(request):
    if not ai_compose.compose_available():
        # Pre-stream guard answered as plain JSON (streamAi content-sniffs
        # and returns a JSON body as-is) — same convention as blog/site-ai.
        return JsonResponse({"kind": "unavailable"})

    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    message = str(data.get("message") or "").strip()[:MESSAGE_MAX_LEN]
    transcript = data.get("transcript") if isinstance(data.get("transcript"), list) else []
    selections = _clean_selections(data.get("selections") if isinstance(data.get("selections"), list) else [])
    attachments = _clean_attachments(tenant, data.get("attached_photos"))

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            payload, cost = engine.run_turn(tenant, transcript, selections, message, attachments)
            yield sse_frame({"type": "done", **payload})
        except core_ai.AiError as exc:
            cost = getattr(exc, "cost_usd", None) or Decimal("0")
            logger.exception("copilot converse failed schema=%s", tenant.schema_name)
            yield sse_frame({"type": "error"})
        except Exception:
            logger.exception("copilot converse failed schema=%s", tenant.schema_name)
            yield sse_frame({"type": "error"})
        finally:
            ai_compose.record_spend(tenant.schema_name, cost)

    return stream_response(frames())


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_photo_describe(request):
    """Vision caption for a just-uploaded attachment: what does the photo
    show? Saved to Photo.alt_text so the copilot (and media search) can
    refer to it later. Best-effort — always 200 with a possibly-empty
    description; an upload must never fail on a describe hiccup."""
    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    photo_id = str(data.get("photo_id") or "")
    if not photo_id or not ai_compose.compose_available():
        return Response({"description": ""})
    from apps.media.models import Photo

    cost = Decimal("0")
    description = ""
    try:
        with tenant_context(tenant):
            photo = Photo.objects.filter(pk=photo_id).first()
            if photo is not None:
                description, cost = photos.describe_tenant_photo(photo)
    except Exception:
        logger.exception("copilot describe failed schema=%s", tenant.schema_name)
    finally:
        ai_compose.record_spend(tenant.schema_name, cost)
    return Response({"description": description})


_CREATORS = {
    "create_course": lambda user, action: content.create_course(user, action["params"]),
    "create_event": lambda user, action: content.create_event(user, action["event_kind"], action["params"]),
    "create_blog_post": lambda user, action: content.create_blog_post(user, action["params"]),
    "draft_announcement": lambda user, action: content.create_announcement_draft(user, action["params"]),
    "edit_course": lambda user, action: content.edit_course(action["course_id"], action["params"]),
    "edit_event": lambda user, action: content.edit_event(action["event_id"], action["event_kind"], action["params"]),
    "edit_blog_post": lambda user, action: content.edit_blog_post(action["post_id"], action["params"]),
    "publish_course": lambda user, action: content.publish_course(action["course_id"]),
    "publish_blog_post": lambda user, action: content.publish_blog_post(action["post_id"]),
}


def _execute(tenant, user, action):
    from copy import deepcopy

    from apps.tenant_config.models import TenantConfig

    kind = action.get("kind")
    if kind == "edit_pages":
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            pages_before = deepcopy(cfg.pages or {}) if cfg is not None else {}
        site_ai.apply_edit(tenant, action["pages"], extras=action.get("extras"))
        result = {"kind": kind, "changes_count": action.get("changes_count", 0)}
        return result, {"kind": "restore_pages", "pages": pages_before}
    creator = _CREATORS.get(kind)
    if creator is not None:
        with tenant_context(tenant):
            return creator(user, action), {}
    if kind in ("edit_theme", "edit_navbar"):
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise chrome.ChromeOpError("site is not set up yet")
            if kind == "edit_theme":
                old_theme = cfg.theme
                theme = chrome.clean_theme(action.get("theme"))
                cfg.theme = theme
                fields = ["theme"]
                # Setup Assistant parity with TenantConfigView.perform_update.
                progress = dict(cfg.setup_progress or {})
                if not progress.get("look_edited"):
                    progress["look_edited"] = True
                    cfg.setup_progress = progress
                    fields.append("setup_progress")
                cfg.save(update_fields=fields)
                result = {"kind": kind, "theme": theme}
                inverse = {"kind": "edit_theme", "theme": old_theme}
            else:
                navbar_before = dict(cfg.navbar_config or {})
                cfg.navbar_config = chrome.merge_navbar(cfg.navbar_config or {}, action.get("updates") or {})
                cfg.save(update_fields=["navbar_config"])
                result = {"kind": kind}
                inverse = {"kind": "restore_navbar", "navbar_config": navbar_before}
        # Public pages read theme/navbar through the cached config object.
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return result, inverse
    if kind == "edit_seo":
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise chrome.ChromeOpError("site is not set up yet")
            old_meta_description = cfg.meta_description
            cfg.meta_description = chrome.clean_meta_description(action.get("meta_description"))
            cfg.save(update_fields=["meta_description"])
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return {"kind": kind}, {"kind": "edit_seo", "meta_description": old_meta_description}
    if kind == "set_block_image":
        from django_tenants.utils import schema_context

        from apps.core.curated_photos.materialize import materialize_curated_photo
        from apps.core.models import CuratedPhoto

        row = None
        if not action.get("tenant_photo_id"):
            with schema_context("public"):
                row = CuratedPhoto.objects.filter(pk=action.get("curated_photo_id"), enabled=True).first()
            if row is None:
                raise photos.PhotoOpError("that photo is no longer available")
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise photos.PhotoOpError("site is not set up yet")
            pages_before = deepcopy(cfg.pages or {})
            if action.get("tenant_photo_id"):
                # Coach-attached photo: already a tenant media.Photo row.
                from apps.media.models import Photo

                photo = Photo.objects.filter(pk=action["tenant_photo_id"]).first()
                if photo is None:
                    raise photos.PhotoOpError("that attached photo is not in your library")
            else:
                photo = materialize_curated_photo(row)
            cfg.pages = photos.apply_block_image(
                cfg.pages or {}, action["page"], action["block_id"], action["field"], photo.pk
            )
            cfg.save(update_fields=["pages"])
        # Public pages read blocks through the cached config object too.
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return {"kind": kind, "page": action["page"]}, {"kind": "restore_pages", "pages": pages_before}
    if kind == "set_course_cover":
        from django_tenants.utils import schema_context

        from apps.core.curated_photos.materialize import materialize_curated_photo
        from apps.core.models import CuratedPhoto

        row = None
        if not action.get("tenant_photo_id"):
            with schema_context("public"):
                row = CuratedPhoto.objects.filter(pk=action.get("curated_photo_id"), enabled=True).first()
            if row is None:
                raise photos.PhotoOpError("that photo is no longer available")
        with tenant_context(tenant):
            from apps.courses.models import Course

            course = Course.objects.filter(pk=action.get("course_id")).first()
            if course is None:
                raise photos.PhotoOpError("that course no longer exists")
            old_thumbnail_id = course.thumbnail_id
            if action.get("tenant_photo_id"):
                from apps.media.models import Photo

                photo = Photo.objects.filter(pk=action["tenant_photo_id"]).first()
                if photo is None:
                    raise photos.PhotoOpError("that attached photo is not in your library")
                course.thumbnail = photo
            else:
                course.thumbnail = materialize_curated_photo(row)
            course.save(update_fields=["thumbnail"])
        # Course cards read from the courses API, not the cached config —
        # no cache-bust needed here.
        result = {"kind": kind, "id": course.id, "title": course.title, "url": f"/admin/courses/{course.slug}"}
        # Photo pks are UUIDs — CopilotAudit.inverse is a JSONField, and a raw
        # UUID object isn't JSON-serializable (json.dumps raises TypeError).
        # _record_audit's except is best-effort and swallows that, so the
        # audit row (and undo) would silently never be written. Stringify.
        inverse = {
            "kind": "restore_course_cover",
            "course_id": course.pk,
            "thumbnail_id": str(old_thumbnail_id) if old_thumbnail_id else None,
        }
        return result, inverse
    if kind == "set_event_cover":
        from django_tenants.utils import schema_context

        from apps.core.curated_photos.materialize import materialize_curated_photo
        from apps.core.models import CuratedPhoto

        row = None
        if not action.get("tenant_photo_id"):
            with schema_context("public"):
                row = CuratedPhoto.objects.filter(pk=action.get("curated_photo_id"), enabled=True).first()
            if row is None:
                raise photos.PhotoOpError("that photo is no longer available")
        event_kind = "onsite" if action.get("event_kind") == "onsite" else "live"
        with tenant_context(tenant):
            from apps.live.models import LiveClass, OnsiteEvent

            model = OnsiteEvent if event_kind == "onsite" else LiveClass
            event = model.objects.filter(pk=action.get("event_id")).first()
            if event is None:
                raise photos.PhotoOpError("that event no longer exists")
            old_thumbnail_id = event.thumbnail_id
            if action.get("tenant_photo_id"):
                from apps.media.models import Photo

                photo = Photo.objects.filter(pk=action["tenant_photo_id"]).first()
                if photo is None:
                    raise photos.PhotoOpError("that attached photo is not in your library")
                event.thumbnail = photo
            else:
                event.thumbnail = materialize_curated_photo(row)
            event.save(update_fields=["thumbnail"])
        # Event cards read from the live API, not the cached config —
        # no cache-bust needed here.
        tab = "onsite" if event_kind == "onsite" else "classes"
        result = {
            "kind": kind,
            "id": event.id,
            "title": event.title,
            "url": f"/admin/live?tab={tab}&event={event.id}&kind={event_kind}",
        }
        # Same UUID-into-JSONField hazard as restore_course_cover above —
        # stringify the Photo pk so the audit row actually gets written.
        inverse = {
            "kind": "restore_event_cover",
            "event_id": event.pk,
            "event_kind": event_kind,
            "thumbnail_id": str(old_thumbnail_id) if old_thumbnail_id else None,
        }
        return result, inverse
    if kind == "note_photo":
        from apps.media.models import Photo

        with tenant_context(tenant):
            photo = Photo.objects.filter(pk=action.get("tenant_photo_id")).first()
            if photo is None:
                raise photos.PhotoOpError("that photo is not in your library")
            old_alt_text = photo.alt_text
            photo.alt_text = str(action.get("description") or "")[:300]
            photo.save(update_fields=["alt_text"])
        # UUID pk → stringify for the JSONField inverse (same hazard as
        # restore_course_cover above).
        inverse = {
            "kind": "restore_photo_note",
            "tenant_photo_id": str(photo.pk),
            "alt_text": old_alt_text,
        }
        return {"kind": kind}, inverse
    if kind == "set_logo":
        from django_tenants.utils import schema_context

        from apps.core.curated_logos.materialize import materialize_curated_logo
        from apps.core.models import CuratedLogo

        row = None
        if not action.get("tenant_photo_id"):
            with schema_context("public"):
                row = CuratedLogo.objects.filter(pk=action.get("curated_logo_id"), enabled=True).first()
            if row is None:
                raise logos.LogoOpError("that logo is no longer available")
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise logos.LogoOpError("site is not set up yet")
            old_logo_id = cfg.logo_id
            old_logo_url = cfg.logo_url
            if action.get("tenant_photo_id"):
                # Coach-attached photo: already a tenant media.Photo row.
                from apps.media.models import Photo

                photo = Photo.objects.filter(pk=action["tenant_photo_id"]).first()
                if photo is None:
                    raise photos.PhotoOpError("that attached photo is not in your library")
                cfg.logo = photo
            else:
                cfg.logo = materialize_curated_logo(row)
            cfg.logo_url = ""
            # Setup Assistant parity: a logo counts as "look edited".
            progress = dict(cfg.setup_progress or {})
            if not progress.get("look_edited"):
                progress["look_edited"] = True
                cfg.setup_progress = progress
            cfg.save(update_fields=["logo", "logo_url", "setup_progress"])
        cache.delete(f"tenant:{tenant.schema_name}:config")
        # Same UUID-into-JSONField hazard as restore_course_cover above —
        # stringify the Photo pk so the audit row actually gets written.
        inverse = {
            "kind": "restore_logo",
            "logo_id": str(old_logo_id) if old_logo_id else None,
            "logo_url": old_logo_url,
        }
        return {"kind": kind}, inverse
    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        if cfg is None:
            raise blocks.BlockOpError("site is not set up yet")
        pages = cfg.pages or {}
        pages_before = deepcopy(pages)
        if kind == "add_block":
            pages = blocks.add_block(pages, action["page"], action["block"], action.get("after_block_id"))
        elif kind == "remove_block":
            pages = blocks.remove_block(pages, action["page"], action["block_id"])
        elif kind == "move_block":
            pages = blocks.move_block(
                pages,
                action["page"],
                action["block_id"],
                action.get("after_block_id"),
                to_page=action.get("to_page"),
            )
        elif kind == "edit_block_fields":
            pages, _ = blocks.edit_block_fields(pages, action["page"], action["block_id"], action.get("fields") or {})
        elif kind == "toggle_block":
            pages = blocks.set_block_enabled(pages, action["page"], action["block_id"], action["enabled"])
        elif kind == "duplicate_block":
            pages, _ = blocks.duplicate_block(pages, action["page"], action["block_id"])
        else:
            raise blocks.BlockOpError(f"unknown action: {kind}")
        cfg.pages = pages
        cfg.save(update_fields=["pages"])
    # Public pages read blocks through the cached config object too.
    cache.delete(f"tenant:{tenant.schema_name}:config")
    return {"kind": kind, "page": action.get("page")}, {"kind": "restore_pages", "pages": pages_before}


def _audit_summary(action, result):
    """One human-readable line per executed action for the audit feed.
    English like every other backend-generated card string (TR pass is a
    queued fast-follow across all of them)."""
    kind = action.get("kind", "")
    page = action.get("page") or ""
    block = action.get("block_id") or ""
    title = (result or {}).get("title") or ""
    if kind == "edit_pages":
        return f"Rewrote page copy ({(result or {}).get('changes_count', 0)} field(s))"
    if kind == "add_block":
        return f"Added a {(action.get('block') or {}).get('type', 'section')} section to {page}"
    if kind == "remove_block":
        return f"Removed {block} from {page}"
    if kind == "move_block":
        to_page = action.get("to_page")
        return f"Moved {block} to {to_page}" if to_page else f"Reordered {block} on {page}"
    if kind == "edit_block_fields":
        return f"Edited {len(action.get('fields') or {})} field(s) on {block} ({page})"
    if kind == "toggle_block":
        return f"{'Showed' if action.get('enabled') else 'Hid'} {block} on {page}"
    if kind == "duplicate_block":
        return f"Duplicated {block} on {page}"
    if kind == "edit_theme":
        return f"Switched theme to {action.get('theme')}"
    if kind == "edit_navbar":
        return "Updated the navbar"
    if kind == "edit_seo":
        return "Updated the search description"
    if kind == "set_block_image":
        return f"Set a new photo on {block} ({page})"
    if kind == "set_course_cover":
        return f"Set the cover photo for '{title}'" if title else "Set a course cover photo"
    if kind == "set_event_cover":
        return f"Set the cover photo for event '{title}'" if title else "Set an event cover photo"
    if kind == "set_logo":
        return "Set a new logo"
    if kind == "edit_course":
        return f"Updated course '{title}'" if title else "Updated a course"
    if kind == "edit_event":
        return f"Updated event '{title}'" if title else "Updated an event"
    if kind == "edit_blog_post":
        return f"Updated blog post '{title}'" if title else "Updated a blog post"
    if kind == "publish_course":
        return f"Published course '{title}'" if title else "Published a course"
    if kind == "publish_blog_post":
        return f"Published blog post '{title}'" if title else "Published a blog post"
    if kind in ("create_course", "create_event", "create_blog_post"):
        noun = {"create_course": "course", "create_event": "event", "create_blog_post": "blog post"}[kind]
        return f"Created draft {noun} '{title}'" if title else f"Created a draft {noun}"
    if kind == "draft_announcement":
        return f"Drafted announcement '{title}'" if title else "Drafted an announcement"
    return kind


def _record_audit(tenant, user, action, result, inverse):
    """Append one row to the tenant's 'what changed' trail. Best-effort:
    the change itself already happened — an audit failure must never turn
    a successful execute into an error for the coach. Returns the created
    row's id, or None on failure."""
    from apps.tenant_config.models import CopilotAudit

    try:
        with tenant_context(tenant):
            row = CopilotAudit.objects.create(
                kind=str(action.get("kind") or "")[:40],
                summary=_audit_summary(action, result)[:300],
                payload=action,
                result=result if isinstance(result, dict) else {},
                inverse=inverse if isinstance(inverse, dict) else {},
                actor=user if getattr(user, "pk", None) else None,
            )
            return row.id
    except Exception:
        logger.exception("copilot audit write failed schema=%s", tenant.schema_name)
        return None


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_execute(request):
    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    try:
        action = tokens.take_action(str(data.get("token") or ""), tenant.schema_name)
    except ActionTokenError:
        return Response({"detail": "invalid_token"}, status=403)
    try:
        result, inverse = _execute(tenant, request.user, action)
    except (
        blocks.BlockOpError,
        content.ContentOpError,
        chrome.ChromeOpError,
        photos.PhotoOpError,
        logos.LogoOpError,
    ) as exc:
        return Response({"detail": str(exc)}, status=400)
    logger.info("copilot executed %s schema=%s", action.get("kind"), tenant.schema_name)
    audit_id = _record_audit(tenant, request.user, action, result, inverse)
    return Response({"result": result, "audit_id": audit_id})


AUDIT_FEED_LIMIT = 50


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def copilot_audit(request):
    """Newest-first feed of executed copilot actions for /admin/site-ai."""
    from apps.tenant_config.models import CopilotAudit

    tenant = connection.tenant
    with tenant_context(tenant):
        entries = list(CopilotAudit.objects.values("id", "kind", "summary", "created_at")[:AUDIT_FEED_LIMIT])
    return Response({"entries": entries})


def _photo_exists(pk):
    """Existence-check a Photo in the tenant schema before restoring a
    logo/thumbnail FK to it — both FKs are SET_NULL, so if the row was
    deleted between apply and undo, a blind assign+save raises IntegrityError
    (raw 500). Null ids restore as null without needing this check."""
    from apps.media.models import Photo

    return Photo.objects.filter(pk=pk).exists()


def _apply_inverse(tenant, inverse):
    from apps.tenant_config.models import TenantConfig

    kind = inverse.get("kind")
    with tenant_context(tenant):
        if kind == "restore_photo_note":
            from apps.media.models import Photo

            photo = Photo.objects.filter(pk=inverse.get("tenant_photo_id")).first()
            if photo is None:
                raise blocks.BlockOpError("that photo no longer exists")
            photo.alt_text = str(inverse.get("alt_text") or "")
            photo.save(update_fields=["alt_text"])
            return
        if kind == "restore_course_cover":
            from apps.courses.models import Course

            course = Course.objects.filter(pk=inverse.get("course_id")).first()
            if course is None:
                raise blocks.BlockOpError("that course no longer exists")
            thumbnail_id = inverse.get("thumbnail_id")
            if thumbnail_id is not None and not _photo_exists(thumbnail_id):
                raise blocks.BlockOpError("that photo no longer exists")
            course.thumbnail_id = thumbnail_id
            course.save(update_fields=["thumbnail"])
            return
        if kind == "restore_event_cover":
            from apps.live.models import LiveClass, OnsiteEvent

            model = OnsiteEvent if inverse.get("event_kind") == "onsite" else LiveClass
            event = model.objects.filter(pk=inverse.get("event_id")).first()
            if event is None:
                raise blocks.BlockOpError("that event no longer exists")
            thumbnail_id = inverse.get("thumbnail_id")
            if thumbnail_id is not None and not _photo_exists(thumbnail_id):
                raise blocks.BlockOpError("that photo no longer exists")
            event.thumbnail_id = thumbnail_id
            event.save(update_fields=["thumbnail"])
            return
        cfg = TenantConfig.objects.first()
        if cfg is None:
            raise blocks.BlockOpError("site is not set up yet")
        if kind == "restore_pages":
            cfg.pages = inverse.get("pages") or {}
            cfg.save(update_fields=["pages"])
        elif kind == "edit_theme":
            cfg.theme = chrome.clean_theme(inverse.get("theme"))
            cfg.save(update_fields=["theme"])
        elif kind == "restore_navbar":
            cfg.navbar_config = inverse.get("navbar_config") or {}
            cfg.save(update_fields=["navbar_config"])
        elif kind == "restore_logo":
            logo_id = inverse.get("logo_id")
            if logo_id is not None and not _photo_exists(logo_id):
                raise blocks.BlockOpError("that photo no longer exists")
            cfg.logo_id = logo_id
            cfg.logo_url = inverse.get("logo_url") or ""
            cfg.save(update_fields=["logo", "logo_url"])
        elif kind == "edit_seo":
            cfg.meta_description = str(inverse.get("meta_description") or "")
            cfg.save(update_fields=["meta_description"])
        else:
            raise blocks.BlockOpError("that change cannot be undone")
    cache.delete(f"tenant:{tenant.schema_name}:config")


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_undo(request):
    from django.utils import timezone

    from apps.tenant_config.models import CopilotAudit

    tenant = connection.tenant
    try:
        audit_id = int((request.data or {}).get("audit_id"))
    except (TypeError, ValueError):
        return Response({"detail": "not_found"}, status=404)
    with tenant_context(tenant):
        latest = (
            CopilotAudit.objects.filter(undone_at__isnull=True)
            .exclude(inverse={})
            .order_by("-created_at", "-id")
            .first()
        )
        entry = CopilotAudit.objects.filter(pk=audit_id).first()
    if entry is None:
        return Response({"detail": "not_found"}, status=404)
    if entry.undone_at is not None or not entry.inverse:
        return Response({"detail": "not_undoable"}, status=400)
    if latest is None or latest.pk != entry.pk:
        return Response({"detail": "only the latest change can be undone"}, status=400)
    try:
        _apply_inverse(tenant, entry.inverse)
    except (blocks.BlockOpError, chrome.ChromeOpError) as exc:
        return Response({"detail": str(exc)}, status=400)
    with tenant_context(tenant):
        entry.undone_at = timezone.now()
        entry.save(update_fields=["undone_at"])
    logger.info("copilot undid %s schema=%s", entry.kind, tenant.schema_name)
    return Response({"undone": entry.kind})


# ── chats: server-side conversation threads for the drawer UI ────────────────

MAX_CHAT_ENTRIES = 30
MAX_CHATS = 50
CHAT_ENTRY_TEXT_MAX = 4000
CHAT_TITLE_MAX = 120


def _clean_chat_entries(raw):
    """Server-side guard on the persisted transcript: same shape the widget
    stored in localStorage — {"role", "text", "kind"?, "attached"?} — capped
    to the trailing MAX_CHAT_ENTRIES with bounded strings. Anything else is
    dropped silently; the chat still works, it just doesn't keep junk."""
    if not isinstance(raw, list):
        return []
    cleaned = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in ("coach", "assistant"):
            continue
        entry = {"role": role, "text": str(item.get("text") or "")[:CHAT_ENTRY_TEXT_MAX]}
        if isinstance(item.get("kind"), str) and item["kind"]:
            entry["kind"] = item["kind"][:20]
        attached = item.get("attached")
        if isinstance(attached, list):
            kept = [
                {
                    "id": str(a["id"])[:64],
                    "title": str(a.get("title") or "")[:120],
                    **({"desc": str(a["desc"])[:300]} if a.get("desc") else {}),
                    # Presigned thumbnail for the chat bubble; the widget
                    # degrades to a title chip once it expires.
                    **({"signed_url": str(a["signed_url"])[:2000]} if a.get("signed_url") else {}),
                }
                for a in attached[:MAX_ATTACHED_PHOTOS]
                if isinstance(a, dict) and a.get("id")
            ]
            if kept:
                entry["attached"] = kept
        cleaned.append(entry)
    return cleaned[-MAX_CHAT_ENTRIES:]


def _chat_row(chat):
    return {"id": chat.id, "title": chat.title, "updated_at": chat.updated_at}


def _derive_title(entries):
    """First coach line, trimmed — the drawer list needs a human label and
    non-technical coaches won't name chats themselves."""
    for entry in entries:
        if entry.get("role") == "coach" and entry.get("text", "").strip():
            return " ".join(entry["text"].split())[:CHAT_TITLE_MAX]
    return ""


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def copilot_chats(request):
    """List recent chats / create one (optionally seeded with entries — the
    one-time localStorage import path). Creation prunes beyond MAX_CHATS so
    the table can't grow unbounded."""
    from apps.tenant_config.models import CopilotChat

    tenant = connection.tenant
    if request.method == "GET":
        with tenant_context(tenant):
            rows = [_chat_row(c) for c in CopilotChat.objects.all()[:MAX_CHATS]]
        return Response({"chats": rows})

    data = request.data if isinstance(request.data, dict) else {}
    entries = _clean_chat_entries(data.get("entries"))
    title = str(data.get("title") or "").strip()[:CHAT_TITLE_MAX] or _derive_title(entries)
    with tenant_context(tenant):
        chat = CopilotChat.objects.create(
            title=title,
            entries=entries,
            actor=request.user if getattr(request.user, "pk", None) else None,
        )
        stale = CopilotChat.objects.values_list("id", flat=True)[MAX_CHATS:]
        if stale:
            CopilotChat.objects.filter(id__in=list(stale)).delete()
    return Response({**_chat_row(chat), "entries": chat.entries}, status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def copilot_chat_detail(request, chat_id):
    from apps.tenant_config.models import CopilotChat

    tenant = connection.tenant
    with tenant_context(tenant):
        chat = CopilotChat.objects.filter(pk=chat_id).first()
        if chat is None:
            return Response({"detail": "not_found"}, status=404)
        if request.method == "GET":
            return Response({**_chat_row(chat), "entries": chat.entries})
        if request.method == "DELETE":
            chat.delete()
            return Response(status=204)
        data = request.data if isinstance(request.data, dict) else {}
        fields = []
        if "entries" in data:
            chat.entries = _clean_chat_entries(data.get("entries"))
            fields.append("entries")
            if not chat.title:
                chat.title = _derive_title(chat.entries)
                fields.append("title")
        if isinstance(data.get("title"), str) and data["title"].strip():
            chat.title = data["title"].strip()[:CHAT_TITLE_MAX]
            if "title" not in fields:
                fields.append("title")
        if not fields:
            return Response({"detail": "nothing to update"}, status=400)
        chat.save(update_fields=[*fields, "updated_at"])
        return Response({**_chat_row(chat), "entries": chat.entries})
