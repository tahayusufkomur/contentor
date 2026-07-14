"""Logo Design-with-AI service layer.

Extracted from tenant_config.views so TWO auth contexts share one
implementation: the coach studio (JWT, connection.tenant) and the signup
wizard (wizard token, tenant resolved from the token — the tenant schema
does not exist yet there). Functions take the tenant EXPLICITLY and return
plain dicts; callers own Response() and brief construction.

Quota/budget accounting is unchanged: public-schema LogoAiUsage keyed by
tenant.schema_name — valid before the schema itself exists.
"""

import base64
import logging
import secrets
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache

from apps.core import ai as core_ai

from . import logo_ai
from . import logo_converse as logo_converse_mod

logger = logging.getLogger(__name__)

# Theme id -> primaryHex. KEEP IN SYNC with frontend-customer/src/lib/themes.ts.
THEME_PRIMARY_HEX = {
    "ocean": "#1a56db",
    "ember": "#c2410c",
    "forest": "#15803d",
    "sunset": "#e11d48",
    "violet": "#7c3aed",
    "slate": "#334155",
}

_DRAFT_CACHE_PREFIX = "logo_draft:"
_DRAFT_TTL_SECONDS = 600
_MAX_CRITIQUE_IMAGES = 3
_MAX_IMAGE_B64_CHARS = 700_000
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def ai_status(tenant):
    enabled, _ = core_ai.available()
    eligible = tenant.has_paid_platform_plan
    usage = logo_ai.tenant_usage(tenant.schema_name)
    turns_remaining = max(0, settings.LOGO_AI_MONTHLY_TURN_LIMIT - usage.turns_used)
    refine_remaining = max(0, settings.LOGO_AI_MONTHLY_REFINE_LIMIT - usage.refinements_used)
    reason = None
    if not eligible:
        reason = "upgrade_required"
    elif not enabled:
        reason = "disabled"
    elif turns_remaining <= 0:
        reason = "quota_exhausted"
    return {
        "enabled": enabled,
        "eligible": eligible,
        "turns_remaining": turns_remaining,
        "refine_remaining": refine_remaining,
        "reason": reason,
    }


def _cache_draft(tenant, kind, stage, result):
    token = secrets.token_urlsafe(24)
    cache.set(
        _DRAFT_CACHE_PREFIX + token,
        {
            "kind": kind,
            "stage": stage,
            "tenant": tenant.schema_name,
            "message": result.message,
            "designs": result.designs,
        },
        timeout=_DRAFT_TTL_SECONDS,
    )
    return token


def converse(tenant, brief, data):
    """Pass A of a Design-with-AI turn. Returns a draft + token when the
    provider supports vision (the client renders and calls finish/), or a
    final response on the cli provider. Always a non-empty JSON body."""
    month = logo_ai._current_month()
    empty = {"phase": "final", "message": "", "designs": [], "turns_remaining": 0}

    if not core_ai.available()[0]:
        return {**empty, "source": "disabled"}
    if not tenant.has_paid_platform_plan:
        return {**empty, "source": "upgrade_required"}

    stage = data.get("stage")
    if stage not in logo_converse_mod.STAGES:
        return {**empty, "source": "error"}
    transcript = [m for m in (data.get("transcript") or []) if isinstance(m, dict)][:12]
    pinned = data.get("pinned") if isinstance(data.get("pinned"), dict) else {}
    message = str(data.get("message") or "")[:500]

    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    turns_remaining = max(0, settings.LOGO_AI_MONTHLY_TURN_LIMIT - usage.turns_used)
    if turns_remaining <= 0:
        return {**empty, "source": "quota_exhausted"}
    if logo_ai.global_spend(month=month) >= Decimal(str(settings.LOGO_AI_MONTHLY_BUDGET_USD)):
        logger.warning("logo converse: monthly budget kill-switch tripped (%s)", month)
        return {**empty, "source": "disabled", "turns_remaining": turns_remaining}

    try:
        result = logo_converse_mod.converse_turn(stage, brief, transcript, pinned, message)
    except logo_converse_mod.ConverseError as exc:
        logo_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd, month=month)
        logger.exception("logo converse: turn failed")
        return {**empty, "source": "error", "turns_remaining": turns_remaining}
    except Exception:
        logo_ai.record_attempt_cost(tenant.schema_name, Decimal("0"), month=month)
        logger.exception("logo converse: AI call failed")
        return {**empty, "source": "error", "turns_remaining": turns_remaining}

    logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
    logo_ai.record_successful_turn(tenant.schema_name, month=month)
    body = {
        "message": result.message,
        "designs": result.designs,
        "turns_remaining": turns_remaining - 1,
        "source": "ai",
    }
    if core_ai.supports_vision():
        return {**body, "phase": "draft", "token": _cache_draft(tenant, "converse", stage, result)}
    return {**body, "phase": "final"}


def _decode_images(raw):
    """data:image/png;base64 URLs -> raw base64 strings; enforce count, size
    and PNG magic. Returns None if anything is off."""
    if not isinstance(raw, list) or not 1 <= len(raw) <= _MAX_CRITIQUE_IMAGES:
        return None
    out = []
    for item in raw:
        if not isinstance(item, str) or not item.startswith("data:image/png;base64,"):
            return None
        b64 = item.split(",", 1)[1]
        if len(b64) > _MAX_IMAGE_B64_CHARS:
            return None
        try:
            head = base64.b64decode(b64[:64] + "=" * (-len(b64[:64]) % 4))
        except Exception:
            return None
        if not head.startswith(_PNG_MAGIC):
            return None
        out.append(b64)
    return out


def converse_finish(tenant, data):
    """Pass B: vision critique of the server-cached draft against the
    client's renders. Never costs a turn; any failure returns the draft."""
    month = logo_ai._current_month()
    token = str(data.get("token") or "")
    cached = cache.get(_DRAFT_CACHE_PREFIX + token) if token else None
    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    turns_remaining = max(0, settings.LOGO_AI_MONTHLY_TURN_LIMIT - usage.turns_used)

    if not cached or cached.get("tenant") != tenant.schema_name:
        return {"phase": "final", "message": "", "designs": [], "source": "error", "turns_remaining": turns_remaining}
    cache.delete(_DRAFT_CACHE_PREFIX + token)
    if cached.get("kind") == "refine":
        draft_body = {"phase": "final", "design": cached["design"], "turns_remaining": turns_remaining}
        images = _decode_images(data.get("images"))
        if images is None:
            return {**draft_body, "source": "error"}
        try:
            result = logo_converse_mod.critique_refine(cached, images)
        except logo_converse_mod.ConverseError as exc:
            logo_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd, month=month)
            logger.exception("logo refine finish: critique failed — serving draft")
            return {**draft_body, "source": "draft"}
        except Exception:
            logger.exception("logo refine finish: critique failed — serving draft")
            return {**draft_body, "source": "draft"}
        logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
        return {**draft_body, "design": result.design, "source": "ai"}
    draft_body = {
        "phase": "final",
        "message": cached["message"],
        "designs": cached["designs"],
        "turns_remaining": turns_remaining,
    }
    images = _decode_images(data.get("images"))
    if images is None:
        return {**draft_body, "source": "error"}
    try:
        result = logo_converse_mod.critique_turn(cached["stage"], cached, images)
    except logo_converse_mod.ConverseError as exc:
        logo_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd, month=month)
        logger.exception("logo converse finish: critique failed — serving draft")
        return {**draft_body, "source": "draft"}
    except Exception:
        logo_ai.record_attempt_cost(tenant.schema_name, Decimal("0"), month=month)
        logger.exception("logo converse finish: AI call failed — serving draft")
        return {**draft_body, "source": "draft"}
    logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
    return {**draft_body, "message": result.message, "designs": result.designs, "source": "ai"}


def refine(tenant, data):
    """One gated Claude call -> a refined design (mark/palette/font/layout)
    from the coach's free-text instruction on their current editor draft.
    Always a non-empty JSON body. No result caching (see
    docs/superpowers/plans/2026-07-10-logo-studio-session-undo-refine.md)."""
    month = logo_ai._current_month()

    if not core_ai.available()[0]:
        return {"design": None, "source": "disabled", "refine_remaining": 0}
    if not tenant.has_paid_platform_plan:
        return {"design": None, "source": "upgrade_required", "refine_remaining": 0}

    recipe = data.get("recipe") if isinstance(data.get("recipe"), dict) else {}
    elements = data.get("elements") if isinstance(data.get("elements"), list) else None
    instruction = str(data.get("instruction") or "").strip()[:300]

    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    refine_remaining = max(0, settings.LOGO_AI_MONTHLY_REFINE_LIMIT - usage.refinements_used)

    if not instruction:
        return {"design": None, "source": "error", "refine_remaining": refine_remaining}
    if refine_remaining <= 0:
        return {"design": None, "source": "quota_exhausted", "refine_remaining": 0}

    if logo_ai.global_spend(month=month) >= Decimal(str(settings.LOGO_AI_MONTHLY_BUDGET_USD)):
        logger.warning("logo refine: monthly budget kill-switch tripped (%s)", month)
        return {"design": None, "source": "disabled", "refine_remaining": refine_remaining}

    try:
        result = logo_ai.refine_design(recipe, elements, instruction)
    except logo_ai.RefineError as exc:
        logo_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd, month=month)
        logger.exception("logo refine: validation left nothing usable")
        return {"design": None, "source": "error", "refine_remaining": refine_remaining}
    except Exception:
        logo_ai.record_attempt_cost(tenant.schema_name, Decimal("0"), month=month)
        logger.exception("logo refine: AI call failed")
        return {"design": None, "source": "error", "refine_remaining": refine_remaining}

    logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
    logo_ai.record_successful_refinement(tenant.schema_name, month=month)
    body = {"design": result.design, "source": "ai", "refine_remaining": refine_remaining - 1}
    if core_ai.supports_vision():
        token = secrets.token_urlsafe(24)
        cache.set(
            _DRAFT_CACHE_PREFIX + token,
            {"kind": "refine", "tenant": tenant.schema_name, "design": result.design},
            timeout=_DRAFT_TTL_SECONDS,
        )
        return {**body, "phase": "draft", "token": token}
    return {**body, "phase": "final"}
