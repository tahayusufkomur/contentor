"""Wizard-token variants of the Logo Design-with-AI endpoints.

Same engine, quotas, and budget as the coach studio (logo_api) — only the
auth context and brief source differ: the tenant comes from the wizard
token and the brief from Tenant + wizard_state.answers (no TenantConfig —
the tenant schema doesn't exist yet).

Field collision note: these endpoints receive the wizard AUTH token in
data["token"], but logo_api.converse_finish reads the DRAFT-cache token
from the same key. Wizard clients send the draft token as "draft_token";
we rewrite it before delegating.
"""

import logging

from django.conf import settings
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.storage import get_s3_client
from apps.tenant_config import logo_api

from . import wizard_catalog
from .wizard import _resolve_tenant_from_wizard_token

logger = logging.getLogger(__name__)


def _wizard_brief(tenant, data):
    answers = (tenant.wizard_state or {}).get("answers") or {}
    niche = answers.get("niche") or "general"
    theme = answers.get("theme") or wizard_catalog.THEME_RANKING.get(niche, ("ocean",))[0]
    raw_brief = data.get("brief") if isinstance(data.get("brief"), dict) else {}
    return {
        "brand_name": tenant.name or "My Brand",
        "primary_hex": logo_api.THEME_PRIMARY_HEX.get(theme, "#1a56db"),
        "niche": str(niche)[:120],
        "style_chips": ", ".join(str(c)[:20] for c in (raw_brief.get("style_chips") or [])[:3]),
        "vibe": str(answers.get("description") or "")[:200],
    }


def _engine_data(data):
    """Body copy with the auth token stripped and the draft token restored
    under the key the engine expects."""
    out = {k: v for k, v in data.items() if k != "token"}
    if "draft_token" in out:
        out["token"] = out.pop("draft_token")
    return out


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_status(request):
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    return Response({**logo_api.ai_status(tenant), "paid": tenant.has_paid_platform_plan})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_converse(request):
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.converse(tenant, _wizard_brief(tenant, data), _engine_data(data)))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_converse_finish(request):
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.converse_finish(tenant, _engine_data(data)))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_refine(request):
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.refine(tenant, _engine_data(data)))


_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_MAX_LOGO_UPLOAD_BYTES = 1_048_576  # 1 MB — studio exports are ~20-200 KB
_UPLOAD_KINDS = ("logo", "icon")


def _put_wizard_png(key: str, blob: bytes) -> None:
    """S3 put for staged wizard logo exports. Same client construction + put
    call as apps/core/platform/uploads.py's _store_object (same bucket,
    ContentType image/png)."""
    import io

    get_s3_client().upload_fileobj(
        io.BytesIO(blob), settings.AWS_BUCKET_NAME, key, ExtraArgs={"ContentType": "image/png"}
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_upload(request):
    """Stage the client-rendered logo/icon PNG for provisioning. Deterministic
    key per tenant+kind so re-picks overwrite instead of accumulating."""
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    if not tenant.has_paid_platform_plan:
        return Response({"detail": "upgrade_required"}, status=403)

    kind = str(request.data.get("kind") or "")
    if kind not in _UPLOAD_KINDS:
        return Response({"detail": "kind must be logo or icon."}, status=400)
    upload = request.FILES.get("file")
    if upload is None or upload.size > _MAX_LOGO_UPLOAD_BYTES:
        return Response({"detail": "file required, max 1MB."}, status=400)
    blob = upload.read()
    if not blob.startswith(_PNG_MAGIC):
        return Response({"detail": "file must be a PNG."}, status=400)

    key = f"wizard/{tenant.schema_name}/{kind}.png"
    _put_wizard_png(key, blob)
    logger.info("wizard logo upload slug=%s kind=%s bytes=%d", tenant.slug, kind, len(blob))
    return Response({"key": key})
