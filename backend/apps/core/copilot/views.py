"""Copilot endpoint pair. Coach-JWT (DRF default auth + IsCoachOrOwner — do
NOT clear authentication_classes; that is only for pre-provision wizard
endpoints). No metering: no availability checks, no credits. Every model
call's USD still lands in the onboarding meter (kill-switch integrity)."""

import hashlib
import json
import logging
from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.utils import translation
from django.utils.translation import gettext as _
from django.utils.translation import ngettext
from django_tenants.utils import tenant_context
from rest_framework.decorators import api_view, permission_classes, renderer_classes, throttle_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from apps.core import ai as core_ai
from apps.core.ai_sse import EventStreamRenderer, sse_frame, stream_response
from apps.core.copilot import blocks, chrome, content, engine, logos, photos, runs, team, tokens
from apps.core.copilot import context as page_context
from apps.core.copilot.tokens import ActionTokenError
from apps.core.languages import creator_language
from apps.core.onboarding import ai_compose, site_ai
from apps.core.permissions import IsCoachOrOwner
from apps.core.throttling import CopilotThrottle

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


TRANSCRIPT_KEEP = 20


def _clean_transcript(raw):
    """The client-held transcript, bounded: the last TRANSCRIPT_KEEP entries,
    each just its role, text and kind (all the engine reads)."""
    if not isinstance(raw, list):
        return []
    kept = []
    for item in raw[-TRANSCRIPT_KEEP:]:
        if not isinstance(item, dict):
            continue
        entry = {"role": str(item.get("role") or "")[:20], "text": str(item.get("text") or "")[:MESSAGE_MAX_LEN]}
        if isinstance(item.get("kind"), str) and item["kind"]:
            entry["kind"] = item["kind"][:20]
        kept.append(entry)
    return kept


def _turn_inputs(tenant, data):
    """One turn's cleaned input, shared by converse and a run's start. The
    page context stays raw (bounded) here: a run cleans it when it executes."""
    raw_context = data.get("context")
    return {
        "message": str(data.get("message") or "").strip()[:MESSAGE_MAX_LEN],
        "transcript": _clean_transcript(data.get("transcript")),
        "selections": _clean_selections(data.get("selections") if isinstance(data.get("selections"), list) else []),
        "attachments": _clean_attachments(tenant, data.get("attached_photos")),
        "context_raw": (
            {"path": str(raw_context.get("path") or "")[:200], "intent": str(raw_context.get("intent") or "")[:40]}
            if isinstance(raw_context, dict)
            else None
        ),
        "specialist": team.clean(data.get("specialist")),
    }


def availability(tenant):
    """Why the assistant cannot answer this coach right now, or None. It is
    open to every coach whatever her plan; a plan check or a paywall would
    go here and nowhere else."""
    return None if ai_compose.compose_available() else "unavailable"


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@throttle_classes([CopilotThrottle])
@renderer_classes([JSONRenderer, EventStreamRenderer])
def copilot_converse(request):
    tenant = connection.tenant
    if reason := availability(tenant):
        # Pre-stream guard answered as plain JSON (streamAi content-sniffs
        # and returns a JSON body as-is) — same convention as blog/site-ai.
        return JsonResponse({"kind": reason})

    data = request.data if isinstance(request.data, dict) else {}
    turn = _turn_inputs(tenant, data)
    context = page_context.clean(tenant, turn["context_raw"])

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            payload, cost = engine.run_turn(
                tenant,
                turn["transcript"],
                turn["selections"],
                turn["message"],
                turn["attachments"],
                context,
                specialist=turn["specialist"],
                actor=request.user,
            )
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
    "draft_email": lambda user, action: content.create_email_draft(user, action["params"]),
    "make_reels": lambda user, action: content.make_reels(user, action["params"]),
    "edit_course": lambda user, action: content.edit_course(action["course_id"], action["params"], user=user),
    "edit_curriculum": lambda user, action: content.edit_curriculum(action["course_id"], action["ops"]),
    "edit_event": lambda user, action: content.edit_event(
        action["event_id"], action["event_kind"], action["params"], user=user
    ),
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
    if kind == "set_access":
        from apps.billing import ways

        with tenant_context(tenant):
            try:
                item = ways.item_for(action.get("item_kind"), action.get("item_id"))
                before = ways.ways_of(item)
                after = ways.set_ways(item, action.get("ways"), actor=user)
            except ways.WaysError as exc:
                raise content.ContentOpError(str(exc)) from exc
            result = {
                "kind": kind,
                "id": item.pk,
                "item_kind": action["item_kind"],
                "title": ways.title_of(item),
                "describe": ways.describe(after),
            }
        return result, {"kind": "restore_ways", "item_kind": action["item_kind"], "item_id": item.pk, "ways": before}
    if kind == "edit_email":
        with tenant_context(tenant):
            # No inverse: the editor's Undo takes the Designer's change back.
            return content.edit_email(user, action["params"]), {}
    creator = _CREATORS.get(kind)
    if creator is not None:
        with tenant_context(tenant):
            result = creator(user, action)
            return result, content.created_inverse(action, result)
    if kind in ("edit_style", "edit_navbar"):
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise chrome.ChromeOpError(_("site is not set up yet"))
            if kind == "edit_style":
                from apps.tenant_config import sections

                style_id = chrome.clean_style(action.get("style"))
                inverse = {
                    "kind": "restore_style",
                    "style": cfg.style,
                    "palette": cfg.palette,
                    "pages": deepcopy(cfg.pages or {}),
                }
                cfg.style = style_id
                # A colourway belongs to its style: the new one wears its own.
                cfg.palette = ""
                # Every section block takes the new style's matching layout.
                cfg.pages = sections.restyle_pages(cfg.pages or {}, style_id)
                fields = ["style", "palette", "pages"]
                result = {"kind": kind, "style": style_id}
                # Setup Assistant parity with TenantConfigView.perform_update.
                progress = dict(cfg.setup_progress or {})
                if not progress.get("look_edited"):
                    progress["look_edited"] = True
                    cfg.setup_progress = progress
                    fields.append("setup_progress")
                cfg.save(update_fields=fields)
            else:
                navbar_before = dict(cfg.navbar_config or {})
                cfg.navbar_config = chrome.merge_navbar(cfg.navbar_config or {}, action.get("updates") or {})
                cfg.save(update_fields=["navbar_config"])
                result = {"kind": kind}
                inverse = {"kind": "restore_navbar", "navbar_config": navbar_before}
        # Public pages read style/navbar through the cached config object.
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return result, inverse
    if kind == "edit_seo":
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise chrome.ChromeOpError(_("site is not set up yet"))
            old_meta_description = cfg.meta_description
            cfg.meta_description = chrome.clean_meta_description(action.get("meta_description"))
            cfg.save(update_fields=["meta_description"])
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return {"kind": kind}, {"kind": "edit_seo", "meta_description": old_meta_description}
    if kind == "set_block_image":
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise photos.PhotoOpError(_("site is not set up yet"))
            pages_before = deepcopy(cfg.pages or {})
            # Either the coach's attached photo or the catalog asset, cached into
            # this tenant's storage on the way through.
            photo = photos.photo_for_action(action)
            cfg.pages = photos.apply_block_image(
                cfg.pages or {}, action["page"], action["block_id"], action["field"], photo.pk
            )
            cfg.save(update_fields=["pages"])
        # Public pages read blocks through the cached config object too.
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return {"kind": kind, "page": action["page"]}, {"kind": "restore_pages", "pages": pages_before}
    if kind == "set_course_cover":
        with tenant_context(tenant):
            from apps.courses.models import Course

            course = Course.objects.filter(pk=action.get("course_id")).first()
            if course is None:
                raise photos.PhotoOpError(_("that course no longer exists"))
            old_thumbnail_id = course.thumbnail_id
            course.thumbnail = photos.photo_for_action(action)
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
        event_kind = content.event_kind(action.get("event_kind"))
        with tenant_context(tenant):
            event = content.event_model(event_kind).objects.filter(pk=action.get("event_id")).first()
            if event is None:
                raise photos.PhotoOpError(_("that event no longer exists"))
            old_thumbnail_id = event.thumbnail_id
            event.thumbnail = photos.photo_for_action(action)
            event.save(update_fields=["thumbnail"])
        # Event cards read from the live API, not the cached config —
        # no cache-bust needed here.
        result = {
            "kind": kind,
            "id": event.id,
            "title": event.title,
            "url": content.event_admin_url(event_kind, event.id),
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
                raise photos.PhotoOpError(_("that photo is not in your library"))
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
                raise logos.LogoOpError(_("that logo is no longer available"))
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise logos.LogoOpError(_("site is not set up yet"))
            old_logo_id = cfg.logo_id
            old_logo_url = cfg.logo_url
            if action.get("tenant_photo_id"):
                # Coach-attached photo: already a tenant media.Photo row.
                from apps.media.models import Photo

                photo = Photo.objects.filter(pk=action["tenant_photo_id"]).first()
                if photo is None:
                    raise photos.PhotoOpError(_("that attached photo is not in your library"))
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
            raise blocks.BlockOpError(_("site is not set up yet"))
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
            pages, _changes = blocks.edit_block_fields(
                pages, action["page"], action["block_id"], action.get("fields") or {}
            )
        elif kind == "toggle_block":
            pages = blocks.set_block_enabled(pages, action["page"], action["block_id"], action["enabled"])
        elif kind == "duplicate_block":
            pages, _new = blocks.duplicate_block(pages, action["page"], action["block_id"])
        else:
            raise blocks.BlockOpError(_("unknown action: %(kind)s") % {"kind": kind})
        cfg.pages = pages
        cfg.save(update_fields=["pages"])
    # Public pages read blocks through the cached config object too.
    cache.delete(f"tenant:{tenant.schema_name}:config")
    return {"kind": kind, "page": action.get("page")}, {"kind": "restore_pages", "pages": pages_before}


def _audit_summary(action, result):
    """One human-readable line per executed action for the audit feed, in the active language
    (`_record_audit` runs it in the creator's: the trail has one reader)."""
    kind = action.get("kind", "")
    page = action.get("page") or ""
    block = action.get("block_id") or ""
    title = (result or {}).get("title") or ""
    where = {"page": page, "block": block}
    if kind == "edit_pages":
        count = (result or {}).get("changes_count", 0)
        return ngettext("Rewrote page copy (%(count)d field)", "Rewrote page copy (%(count)d fields)", count) % {
            "count": count
        }
    if kind == "add_block":
        return _("Added a %(type)s section to %(page)s") % {
            "type": (action.get("block") or {}).get("type", "section"),
            "page": page,
        }
    if kind == "remove_block":
        return _("Removed %(block)s from %(page)s") % where
    if kind == "move_block":
        to_page = action.get("to_page")
        if to_page:
            return _("Moved %(block)s to %(page)s") % {"block": block, "page": to_page}
        return _("Reordered %(block)s on %(page)s") % where
    if kind == "edit_block_fields":
        count = len(action.get("fields") or {})
        return ngettext(
            "Edited %(count)d field on %(block)s (%(page)s)", "Edited %(count)d fields on %(block)s (%(page)s)", count
        ) % {"count": count, **where}
    if kind == "toggle_block":
        if action.get("enabled"):
            return _("Showed %(block)s on %(page)s") % where
        return _("Hid %(block)s on %(page)s") % where
    if kind == "duplicate_block":
        return _("Duplicated %(block)s on %(page)s") % where
    if kind == "edit_style":
        return _("Switched site style to %(style)s") % {"style": action.get("style")}
    if kind == "edit_navbar":
        return _("Updated the navbar")
    if kind == "set_access":
        return _("Set access for %(title)s: %(access)s") % {"title": title, "access": result["describe"]}
    if kind == "edit_seo":
        return _("Updated the search description")
    if kind == "set_block_image":
        return _("Set a new photo on %(block)s (%(page)s)") % where
    if kind == "set_course_cover":
        return _("Set the cover photo for '%(title)s'") % {"title": title} if title else _("Set a course cover photo")
    if kind == "set_event_cover":
        return (
            _("Set the cover photo for event '%(title)s'") % {"title": title}
            if title
            else _("Set an event cover photo")
        )
    if kind == "set_logo":
        return _("Set a new logo")
    if kind == "keep_cover":
        title = action.get("title") or title
        return _("Kept a new cover for '%(title)s'") % {"title": title} if title else _("Kept a new cover")
    if kind == "edit_course":
        return _("Updated course '%(title)s'") % {"title": title} if title else _("Updated a course")
    if kind == "edit_curriculum":
        return (
            _("Changed the curriculum of '%(title)s'") % {"title": title}
            if title
            else _("Changed a course's curriculum")
        )
    if kind == "edit_event":
        return _("Updated event '%(title)s'") % {"title": title} if title else _("Updated an event")
    if kind == "edit_blog_post":
        return _("Updated blog post '%(title)s'") % {"title": title} if title else _("Updated a blog post")
    if kind == "publish_course":
        return _("Published course '%(title)s'") % {"title": title} if title else _("Published a course")
    if kind == "publish_blog_post":
        return _("Published blog post '%(title)s'") % {"title": title} if title else _("Published a blog post")
    if kind == "create_event":
        # Not a draft: students see it from the moment she confirms.
        return _("Scheduled '%(title)s'") % {"title": title} if title else _("Scheduled an event")
    if kind == "create_course":
        return _("Created draft course '%(title)s'") % {"title": title} if title else _("Created a draft course")
    if kind == "create_blog_post":
        return _("Created draft blog post '%(title)s'") % {"title": title} if title else _("Created a draft blog post")
    if kind == "draft_announcement":
        return _("Drafted announcement '%(title)s'") % {"title": title} if title else _("Drafted an announcement")
    if kind == "draft_email":
        return _("Drafted email '%(title)s'") % {"title": title} if title else _("Drafted an email")
    if kind == "edit_email":
        return _("Changed email '%(title)s'") % {"title": title} if title else _("Changed an email")
    if kind == "make_reels":
        return _("Started reels from '%(title)s'") % {"title": title} if title else _("Started reels from a video")
    return kind


def _record_audit(tenant, user, action, result, inverse):
    """Append one row to the tenant's 'what changed' trail. Best-effort:
    the change itself already happened — an audit failure must never turn
    a successful execute into an error for the coach. Returns the created
    row's id, or None on failure."""
    from apps.tenant_config.models import CopilotAudit

    try:
        inverse = inverse if isinstance(inverse, dict) else {}
        if inverse and not _order_free(inverse):
            # What the change left behind: undo later only if it still stands.
            inverse = {**inverse, "after": _state_stamp(tenant, inverse)}
        with tenant_context(tenant):
            # The trail's one reader is the creator: the acting user, else the owner (a background
            # step has no one acting), whatever language the request or task runs in.
            with translation.override(creator_language(user if getattr(user, "pk", None) else None)):
                summary = _audit_summary(action, result)[:300]
            row = CopilotAudit.objects.create(
                kind=str(action.get("kind") or "")[:40],
                summary=summary,
                payload=action,
                result=result if isinstance(result, dict) else {},
                inverse=inverse,
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


def _order_free(inverse):
    """Deleting a draft the copilot created does not depend on what came
    after it. Every other inverse restores a snapshot, so only the newest
    one may run."""
    return inverse.get("kind") == "delete_created"


def _latest_snapshot():
    """The one snapshot-restoring change that could still be undone."""
    from apps.tenant_config.models import CopilotAudit

    return (
        CopilotAudit.objects.filter(undone_at__isnull=True)
        .exclude(inverse={})
        .exclude(inverse__kind="delete_created")
        .order_by("-created_at", "-id")
        .first()
    )


def _restored_state(inverse):
    """What applying this snapshot inverse would overwrite, as it is right
    now (None or [] when its target is gone). Caller holds tenant_context."""
    from apps.tenant_config.models import TenantConfig

    kind = inverse.get("kind")
    if kind == "restore_photo_note":
        from apps.media.models import Photo

        return list(Photo.objects.filter(pk=inverse.get("tenant_photo_id")).values_list("alt_text", flat=True))
    if kind == "restore_course_cover":
        from apps.courses.models import Course

        return list(Course.objects.filter(pk=inverse.get("course_id")).values_list("thumbnail_id", flat=True))
    if kind == "restore_event_cover":
        model = content.event_model(inverse.get("event_kind"))
        return list(model.objects.filter(pk=inverse.get("event_id")).values_list("thumbnail_id", flat=True))
    if kind == "restore_cover_design":
        from apps.media import designs

        return designs.cover_state(inverse)
    if kind == "restore_ways":
        from apps.billing import ways

        try:
            return ways.ways_of(ways.item_for(inverse.get("item_kind"), inverse.get("item_id")))
        except ways.WaysError:
            return None
    cfg = TenantConfig.objects.first()
    if cfg is None:
        return None
    return {
        "restore_pages": lambda: cfg.pages,
        "restore_style": lambda: [cfg.style, cfg.pages],
        "restore_navbar": lambda: cfg.navbar_config,
        "restore_logo": lambda: [cfg.logo_id, cfg.logo_url],
        "edit_seo": lambda: cfg.meta_description,
    }.get(kind, lambda: None)()


def _state_stamp(tenant, inverse):
    with tenant_context(tenant):
        state = _restored_state(inverse)
    return hashlib.sha256(json.dumps(state, sort_keys=True, default=str).encode()).hexdigest()[:16]


SNAPSHOT_STALE = "it was changed since, so undoing it would overwrite newer work"


def _still_stands(tenant, inverse):
    """A snapshot may be restored only over exactly what its change left: a
    restore over later edits (the site editor writes no audit rows) would
    silently wipe them. Rows from before this check carry no stamp and are
    never restored."""
    return _order_free(inverse) or inverse.get("after") == _state_stamp(tenant, inverse)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def copilot_audit(request):
    """Newest-first feed of executed copilot actions for the assistant's
    History tab; ``undoable`` says which rows Undo can still act on."""
    from django.db.models.fields.json import KT

    from apps.tenant_config.models import CopilotAudit

    tenant = connection.tenant
    with tenant_context(tenant):
        latest = _latest_snapshot()
        # Only the inverse's kind and the payload's maker: either can hold a whole pages tree.
        rows = list(
            CopilotAudit.objects.annotate(inverse_kind=KT("inverse__kind"), maker=KT("payload__made_by")).values(
                "id", "kind", "summary", "created_at", "undone_at", "inverse_kind", "maker"
            )[:AUDIT_FEED_LIMIT]
        )
    restorable_id = latest.id if latest is not None and _still_stands(tenant, latest.inverse) else None
    entries = [
        {
            "id": row["id"],
            "kind": row["kind"],
            "summary": row["summary"],
            "created_at": row["created_at"],
            # "" = she made it, otherwise the key of the specialist who did (only a Keep's payload says).
            "by": row["maker"] or "",
            "undone": row["undone_at"] is not None,
            "undoable": row["undone_at"] is None
            and (row["inverse_kind"] == "delete_created" or row["id"] == restorable_id),
        }
        for row in rows
    ]
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
        if kind == "delete_created":
            content.delete_created(inverse)
            return
        if kind == "restore_photo_note":
            from apps.media.models import Photo

            photo = Photo.objects.filter(pk=inverse.get("tenant_photo_id")).first()
            if photo is None:
                raise blocks.BlockOpError(_("that photo no longer exists"))
            photo.alt_text = str(inverse.get("alt_text") or "")
            photo.save(update_fields=["alt_text"])
            return
        if kind == "restore_course_cover":
            from apps.courses.models import Course

            course = Course.objects.filter(pk=inverse.get("course_id")).first()
            if course is None:
                raise blocks.BlockOpError(_("that course no longer exists"))
            thumbnail_id = inverse.get("thumbnail_id")
            if thumbnail_id is not None and not _photo_exists(thumbnail_id):
                raise blocks.BlockOpError(_("that photo no longer exists"))
            course.thumbnail_id = thumbnail_id
            course.save(update_fields=["thumbnail"])
            return
        if kind == "restore_event_cover":
            event = content.event_model(inverse.get("event_kind")).objects.filter(pk=inverse.get("event_id")).first()
            if event is None:
                raise blocks.BlockOpError(_("that event no longer exists"))
            thumbnail_id = inverse.get("thumbnail_id")
            if thumbnail_id is not None and not _photo_exists(thumbnail_id):
                raise blocks.BlockOpError(_("that photo no longer exists"))
            event.thumbnail_id = thumbnail_id
            event.save(update_fields=["thumbnail"])
            return
        if kind == "restore_cover_design":
            from apps.media import designs

            designs.restore_cover(inverse)
            return
        if kind == "restore_ways":
            from apps.billing import ways

            try:
                ways.set_ways(ways.item_for(inverse.get("item_kind"), inverse.get("item_id")), inverse.get("ways"))
            except ways.WaysError as exc:
                raise content.ContentOpError(str(exc)) from exc
            return
        cfg = TenantConfig.objects.first()
        if cfg is None:
            raise blocks.BlockOpError(_("site is not set up yet"))
        if kind == "restore_pages":
            cfg.pages = inverse.get("pages") or {}
            cfg.save(update_fields=["pages"])
        elif kind == "restore_style":
            cfg.style = str(inverse.get("style") or "")[:40]
            cfg.palette = str(inverse.get("palette") or "")[:40]
            cfg.pages = inverse.get("pages") or {}
            cfg.save(update_fields=["style", "palette", "pages"])
        elif kind == "restore_navbar":
            cfg.navbar_config = inverse.get("navbar_config") or {}
            cfg.save(update_fields=["navbar_config"])
        elif kind == "restore_logo":
            logo_id = inverse.get("logo_id")
            if logo_id is not None and not _photo_exists(logo_id):
                raise blocks.BlockOpError(_("that photo no longer exists"))
            cfg.logo_id = logo_id
            cfg.logo_url = inverse.get("logo_url") or ""
            cfg.save(update_fields=["logo", "logo_url"])
        elif kind == "edit_seo":
            cfg.meta_description = str(inverse.get("meta_description") or "")
            cfg.save(update_fields=["meta_description"])
        else:
            raise blocks.BlockOpError(_("that change cannot be undone"))
    cache.delete(f"tenant:{tenant.schema_name}:config")


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_undo(request):
    from django.utils import timezone

    from apps.media.designs import DesignError
    from apps.tenant_config.models import CopilotAudit

    tenant = connection.tenant
    try:
        audit_id = int((request.data or {}).get("audit_id"))
    except (TypeError, ValueError):
        return Response({"detail": "not_found"}, status=404)
    with tenant_context(tenant):
        latest = _latest_snapshot()
        entry = CopilotAudit.objects.filter(pk=audit_id).first()
    if entry is None:
        return Response({"detail": "not_found"}, status=404)
    if entry.undone_at is not None or not entry.inverse:
        return Response({"detail": "not_undoable"}, status=400)
    if not _order_free(entry.inverse) and (latest is None or latest.pk != entry.pk):
        return Response({"detail": _("only the latest change can be undone")}, status=400)
    if entry.inverse.get("kind") == "restore_ways":
        # The undo writes as the system, so the owner-only rule is checked for the one asking. A refusal
        # here is theirs, not for good: the inverse stays for the owner.
        from apps.billing import ways

        with tenant_context(tenant):
            try:
                item = ways.item_for(entry.inverse.get("item_kind"), entry.inverse.get("item_id"))
                ways.validate(item, entry.inverse.get("ways"), actor=request.user)
            except ways.WaysError as exc:
                if exc.code == "owner_only":
                    return Response({"detail": str(exc)}, status=403)
    try:
        if not _still_stands(tenant, entry.inverse):
            raise content.ContentOpError(SNAPSHOT_STALE)
        _apply_inverse(tenant, entry.inverse)
    except (blocks.BlockOpError, chrome.ChromeOpError, content.ContentOpError, DesignError) as exc:
        # Every refusal here is for good (she changed it, or its target is
        # gone): History stops offering it, and it no longer stands in front
        # of the change before it.
        with tenant_context(tenant):
            entry.inverse = {}
            entry.save(update_fields=["inverse"])
        return Response({"detail": str(exc)}, status=400)
    with tenant_context(tenant):
        entry.undone_at = timezone.now()
        entry.save(update_fields=["undone_at"])
    logger.info("copilot undid %s schema=%s", entry.kind, tenant.schema_name)
    # The record it touched (a course, a class), so the page showing it reloads.
    return Response({"undone": entry.kind, "id": (entry.result or {}).get("id")})


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
        # Who on the team wrote the reply; unknown names are dropped.
        if role == "assistant" and item.get("specialist") in team.KEYS:
            entry["specialist"] = item["specialist"]
        # The run behind a reply, so a reply still being written can resume.
        run = item.get("run")
        if role == "assistant" and isinstance(run, int) and not isinstance(run, bool) and run > 0:
            entry["run"] = run
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
            return Response({"detail": _("nothing to update")}, status=400)
        chat.save(update_fields=[*fields, "updated_at"])
        return Response({**_chat_row(chat), "entries": chat.entries})


# ── runs: the Team panel's turns, carried out by the agents worker ───────────


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@throttle_classes([CopilotThrottle])
def copilot_run_start(request):
    """Start one of the team's runs (apps.core.copilot.runs): the agents
    worker carries it out and the studio follows its events."""
    tenant = connection.tenant
    if reason := availability(tenant):
        return Response({"kind": reason})
    data = request.data if isinstance(request.data, dict) else {}
    turn = _turn_inputs(tenant, data)
    chat = data.get("chat")
    with tenant_context(tenant):
        run = runs.start(
            request.user,
            message=turn["message"],
            transcript=turn["transcript"],
            selections=turn["selections"],
            attachments=turn["attachments"],
            context=turn["context_raw"],
            specialist=turn["specialist"],
            chat_id=chat if isinstance(chat, int) and not isinstance(chat, bool) else None,
        )
    return Response({"id": run.id, "status": run.status, "specialist": run.specialist}, status=201)


def _her_run(request, run_id):
    from apps.tenant_config.models import CopilotRun

    return CopilotRun.objects.filter(pk=run_id, actor=request.user).first()


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def copilot_runs_open(request):
    """Her runs still going, and finished ones she has not seen yet."""
    from apps.tenant_config.models import CopilotRun

    with tenant_context(connection.tenant):
        runs.sweep(CopilotRun.objects.filter(actor=request.user, status__in=runs.ACTIVE))
        return Response({"runs": runs.open_for(request.user)})


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def copilot_run_detail(request, run_id):
    """A run's status and its events after ``?since=`` (the last seq seen)."""
    from apps.tenant_config.models import CopilotRun

    with tenant_context(connection.tenant):
        run = _her_run(request, run_id)
        if run is None:
            return Response({"detail": "not_found"}, status=404)
        runs.sweep(CopilotRun.objects.filter(pk=run.pk))
        run.refresh_from_db()
        try:
            since = max(0, int(request.query_params.get("since") or 0))
        except ValueError:
            since = 0
        return Response(runs.as_dict(run, since))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_run_stop(request, run_id):
    with tenant_context(connection.tenant):
        run = _her_run(request, run_id)
        if run is None:
            return Response({"detail": "not_found"}, status=404)
        return Response({"status": runs.stop(run.pk)})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_run_seen(request, run_id):
    """She has seen what the run made: it leaves the "ready for you" list."""
    from django.utils import timezone

    with tenant_context(connection.tenant):
        run = _her_run(request, run_id)
        if run is None:
            return Response({"detail": "not_found"}, status=404)
        if run.seen_at is None:
            run.seen_at = timezone.now()
            run.save(update_fields=["seen_at"])
    return Response(status=204)
