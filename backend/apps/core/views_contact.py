"""Public contact form endpoint for tenant sites.

The website builder's ``contact`` block POSTs here. The message is emailed to
the tenant's coach/owner — the recipient is resolved server-side from the
tenant schema, never taken from the request, so this can't be abused as an
open relay.
"""

import logging

from django.db import connection
from django.utils.html import escape
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.accounts.models import User
from apps.core.email import send_email

logger = logging.getLogger(__name__)


class ContactThrottle(AnonRateThrottle):
    rate = "5/min"


class ContactMessageSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    email = serializers.EmailField()
    message = serializers.CharField(max_length=4000)
    subject = serializers.CharField(max_length=200, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=50, required=False, allow_blank=True)
    # Honeypot: hidden field real visitors never fill. If set, drop silently.
    website = serializers.CharField(max_length=200, required=False, allow_blank=True)


def _coach_recipient() -> str | None:
    """Email of the tenant's coach. Prefers the owner, falls back to a coach."""
    for role in ("owner", "coach"):
        user = User.objects.filter(role=role).exclude(email="").first()
        if user and user.email:
            return user.email
    return None


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ContactThrottle])
def contact_submit(request):
    serializer = ContactMessageSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Honeypot tripped — pretend success, send nothing.
    if data.get("website"):
        return Response({"detail": "sent"})

    tenant = connection.tenant
    brand_name = tenant.name
    try:
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        if config and config.brand_name:
            brand_name = config.brand_name
    except Exception:
        logger.debug("Could not load tenant config for contact email", exc_info=True)

    # Demo tenants accept the form but never actually email anyone.
    if getattr(tenant, "is_demo", False):
        return Response({"detail": "sent"})

    recipient = _coach_recipient()
    if recipient:
        name = escape(data["name"])
        reply_email = escape(data["email"])
        phone = escape(data.get("phone", ""))
        subject = data.get("subject") or f"New message from {data['name']}"
        body = escape(data["message"]).replace("\n", "<br/>")
        phone_row = f"<p style='color:#888;font-size:13px;'>Phone: {phone}</p>" if phone else ""
        html = f"""
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
            <h2 style="color:#1a1a2e;margin:0 0 4px;">New contact message</h2>
            <p style="color:#888;font-size:13px;margin:0 0 16px;">via {escape(brand_name)}</p>
            <p style="color:#444;"><strong>{name}</strong> &lt;{reply_email}&gt;</p>
            {phone_row}
            <div style="margin-top:12px;padding:16px;background:#f5f5f7;border-radius:8px;color:#222;">{body}</div>
        </div>
        """
        send_email(to=recipient, subject=f"[{escape(brand_name)}] {escape(subject)}", html=html, from_name=brand_name)
    else:
        logger.warning("Contact form submitted for tenant %s but no coach recipient found", tenant.slug)

    # Never leak whether a recipient exists.
    return Response({"detail": "sent"})
