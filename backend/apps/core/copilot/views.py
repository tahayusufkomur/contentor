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
from apps.core.copilot import blocks, chrome, content, engine, photos, tokens
from apps.core.copilot.tokens import ActionTokenError
from apps.core.onboarding import ai_compose, site_ai
from apps.core.permissions import IsCoachOrOwner

logger = logging.getLogger(__name__)

MESSAGE_MAX_LEN = 2000

SELECTION_CAPS = {"path": 200, "block_id": 40, "tag": 40, "text": 200, "context": 120}


def _clean_selections(raw):
    cleaned = []
    for item in raw[:5]:
        if not isinstance(item, dict):
            continue
        cleaned.append({k: str(item.get(k) or "")[:cap] for k, cap in SELECTION_CAPS.items()})
    return cleaned


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

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            payload, cost = engine.run_turn(tenant, transcript, selections, message)
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


_CREATORS = {
    "create_course": lambda user, action: content.create_course(user, action["params"]),
    "create_event": lambda user, action: content.create_event(user, action["event_kind"], action["params"]),
    "create_blog_post": lambda user, action: content.create_blog_post(user, action["params"]),
    "edit_course": lambda user, action: content.edit_course(action["course_id"], action["params"]),
}


def _execute(tenant, user, action):
    from apps.tenant_config.models import TenantConfig

    kind = action.get("kind")
    if kind == "edit_pages":
        site_ai.apply_edit(tenant, action["pages"], extras=action.get("extras"))
        return {"kind": kind, "changes_count": action.get("changes_count", 0)}
    creator = _CREATORS.get(kind)
    if creator is not None:
        with tenant_context(tenant):
            return creator(user, action)
    if kind in ("edit_theme", "edit_navbar"):
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise chrome.ChromeOpError("site is not set up yet")
            if kind == "edit_theme":
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
            else:
                cfg.navbar_config = chrome.merge_navbar(cfg.navbar_config or {}, action.get("updates") or {})
                cfg.save(update_fields=["navbar_config"])
                result = {"kind": kind}
        # Public pages read theme/navbar through the cached config object.
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return result
    if kind == "set_block_image":
        from django_tenants.utils import schema_context

        from apps.core.curated_photos.materialize import materialize_curated_photo
        from apps.core.models import CuratedPhoto

        with schema_context("public"):
            row = CuratedPhoto.objects.filter(pk=action.get("curated_photo_id"), enabled=True).first()
        if row is None:
            raise photos.PhotoOpError("that photo is no longer available")
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise photos.PhotoOpError("site is not set up yet")
            photo = materialize_curated_photo(row)
            cfg.pages = photos.apply_block_image(
                cfg.pages or {}, action["page"], action["block_id"], action["field"], photo.pk
            )
            cfg.save(update_fields=["pages"])
        # Public pages read blocks through the cached config object too.
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return {"kind": kind, "page": action["page"]}
    if kind == "set_course_cover":
        from django_tenants.utils import schema_context

        from apps.core.curated_photos.materialize import materialize_curated_photo
        from apps.core.models import CuratedPhoto

        with schema_context("public"):
            row = CuratedPhoto.objects.filter(pk=action.get("curated_photo_id"), enabled=True).first()
        if row is None:
            raise photos.PhotoOpError("that photo is no longer available")
        with tenant_context(tenant):
            from apps.courses.models import Course

            course = Course.objects.filter(pk=action.get("course_id")).first()
            if course is None:
                raise photos.PhotoOpError("that course no longer exists")
            course.thumbnail = materialize_curated_photo(row)
            course.save(update_fields=["thumbnail"])
        # Course cards read from the courses API, not the cached config —
        # no cache-bust needed here.
        return {"kind": kind, "id": course.id, "title": course.title, "url": f"/admin/courses/{course.slug}"}
    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        if cfg is None:
            raise blocks.BlockOpError("site is not set up yet")
        pages = cfg.pages or {}
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
    return {"kind": kind, "page": action.get("page")}


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
    if kind == "set_block_image":
        return f"Set a new photo on {block} ({page})"
    if kind == "set_course_cover":
        return f"Set the cover photo for '{title}'" if title else "Set a course cover photo"
    if kind == "edit_course":
        return f"Updated course '{title}'" if title else "Updated a course"
    if kind in ("create_course", "create_event", "create_blog_post"):
        noun = {"create_course": "course", "create_event": "event", "create_blog_post": "blog post"}[kind]
        return f"Created draft {noun} '{title}'" if title else f"Created a draft {noun}"
    return kind


def _record_audit(tenant, user, action, result):
    """Append one row to the tenant's 'what changed' trail. Best-effort:
    the change itself already happened — an audit failure must never turn
    a successful execute into an error for the coach."""
    from apps.tenant_config.models import CopilotAudit

    try:
        with tenant_context(tenant):
            CopilotAudit.objects.create(
                kind=str(action.get("kind") or "")[:40],
                summary=_audit_summary(action, result)[:300],
                payload=action,
                result=result if isinstance(result, dict) else {},
                actor=user if getattr(user, "pk", None) else None,
            )
    except Exception:
        logger.exception("copilot audit write failed schema=%s", tenant.schema_name)


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
        result = _execute(tenant, request.user, action)
    except (blocks.BlockOpError, content.ContentOpError, chrome.ChromeOpError, photos.PhotoOpError) as exc:
        return Response({"detail": str(exc)}, status=400)
    logger.info("copilot executed %s schema=%s", action.get("kind"), tenant.schema_name)
    _record_audit(tenant, request.user, action, result)
    return Response({"result": result})


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
