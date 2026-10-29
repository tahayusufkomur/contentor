"""Platform email endpoints (superadmin only, public schema).

Mirrors `apps.email_campaigns.views`: drafts edited in the shared editor, templates, a preview, a test
to oneself and the send, all on the email engine in Contentor's own kit. Recipients are coaches.
"""

import logging

from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsSuperUser
from apps.email_campaigns import brand
from apps.email_campaigns.render import personalize
from apps.email_campaigns.serializers import RenderSerializer
from apps.email_campaigns.starters import blank_design

from .models import CampaignStatus, PlatformEmailCampaign, PlatformEmailTemplate
from .recipients import get_recipient_count
from .serializers import (
    DraftCreateSerializer,
    DraftUpdateSerializer,
    PlatformCampaignRecipientSerializer,
    PlatformEmailCampaignListSerializer,
    PlatformEmailCampaignSerializer,
    PlatformTemplateSerializer,
    SendSerializer,
)

logger = logging.getLogger(__name__)


def build(design, subject="", preheader="", language=None):
    """(html, text) of a platform email in Contentor's kit and the creators' `language`, merge variables left
    for personalize."""
    html, text, _warnings = brand.build(
        design, None, subject=subject, preheader=preheader, kit_=brand.platform_kit(language)
    )
    return html, text


@api_view(["GET"])
@permission_classes([IsSuperUser])
def brand_view(_request):
    return Response(brand.platform_kit())


@api_view(["POST"])
@permission_classes([IsSuperUser])
def render_view(request):
    serializer = RenderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    html, text = build(data["design"], data["subject"], data["preheader"])
    return Response({"html": personalize(html, {"FirstName": "Alex", "Name": "Alex"}), "text": text, "warnings": []})


@api_view(["GET", "POST"])
@permission_classes([IsSuperUser])
def template_list(request):
    if request.method == "POST":
        serializer = PlatformTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(PlatformTemplateSerializer(serializer.save()).data, status=status.HTTP_201_CREATED)
    rows = []
    for template in PlatformEmailTemplate.objects.all():
        row = PlatformTemplateSerializer(template).data
        row.pop("design", None)
        try:
            row["preview_html"] = build(template.design, template.subject)[0]
        except Exception:  # noqa: BLE001 — one broken design must not hide the rest
            logger.exception("platform template %s preview failed", template.pk)
            row["preview_html"] = ""
        rows.append(row)
    return Response({"results": rows})


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsSuperUser])
def template_detail(request, pk: int):
    template = get_object_or_404(PlatformEmailTemplate, pk=pk)
    if request.method == "DELETE":
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "PATCH":
        serializer = PlatformTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(PlatformTemplateSerializer(template).data)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def recipient_options(_request):
    """Everything the recipient selector needs: coaches, plans, and workspaces."""
    from apps.accounts.models import User
    from apps.core.models import PlatformPlan, Tenant

    coaches = list(
        User.objects.filter(role="coach", is_active=True).order_by("name", "email").values("id", "name", "email")
    )
    plans = list(PlatformPlan.objects.filter(is_active=True).order_by("price_monthly").values("id", "name"))
    tenants = list(Tenant.objects.exclude(schema_name="public").order_by("name").values("id", "name", "owner_email"))
    return Response({"coaches": coaches, "plans": plans, "tenants": tenants})


@api_view(["GET", "POST"])
@permission_classes([IsSuperUser])
def campaign_list(request):
    if request.method == "POST":
        serializer = DraftCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = None
        if serializer.validated_data.get("template_id"):
            template = PlatformEmailTemplate.objects.filter(pk=serializer.validated_data["template_id"]).first()
            if template is None:
                return Response({"detail": _("Template not found.")}, status=status.HTTP_404_NOT_FOUND)
        campaign = PlatformEmailCampaign.objects.create(
            status=CampaignStatus.DRAFT,
            design=template.design if template else blank_design(),
            subject=template.subject if template else "",
            preheader=template.preheader if template else "",
            template_name=template.name if template else "",
            recipient_filter={"type": "all_coaches"},
            sender=request.user,
        )
        return Response(PlatformEmailCampaignSerializer(campaign).data, status=status.HTTP_201_CREATED)
    campaigns = PlatformEmailCampaign.objects.select_related("sender").defer("rendered_html", "design")
    try:
        limit = max(1, min(int(request.query_params.get("limit", 20)), 100))
    except ValueError:
        limit = 20
    try:
        offset = max(0, int(request.query_params.get("offset", 0)))
    except ValueError:
        offset = 0
    total = campaigns.count()
    page = campaigns[offset : offset + limit]
    return Response({"count": total, "results": PlatformEmailCampaignListSerializer(page, many=True).data})


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsSuperUser])
def campaign_detail(request, pk: int):
    campaign = get_object_or_404(PlatformEmailCampaign.objects.select_related("sender"), pk=pk)
    if request.method == "DELETE":
        if campaign.status != CampaignStatus.DRAFT:
            return Response({"detail": _("Only drafts can be deleted.")}, status=status.HTTP_400_BAD_REQUEST)
        campaign.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "PATCH":
        if campaign.status != CampaignStatus.DRAFT:
            return Response({"detail": _("This email was already sent.")}, status=status.HTTP_400_BAD_REQUEST)
        serializer = DraftUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(campaign, field, value)
        campaign.save()
    return Response(PlatformEmailCampaignSerializer(campaign).data)


@api_view(["POST"])
@permission_classes([IsSuperUser])
def campaign_send(request, pk: int):
    campaign = get_object_or_404(PlatformEmailCampaign, pk=pk)
    if campaign.status != CampaignStatus.DRAFT:
        return Response({"detail": _("This email is already on its way.")}, status=status.HTTP_409_CONFLICT)
    if not campaign.subject.strip():
        return Response({"detail": _("Give your email a subject first.")}, status=status.HTTP_400_BAD_REQUEST)
    if not any(brand.blocks_of(campaign.design)):
        return Response({"detail": _("This email is empty.")}, status=status.HTTP_400_BAD_REQUEST)
    serializer = SendSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    recipient_filter = serializer.validated_data["recipient_filter"]
    claimed = PlatformEmailCampaign.objects.filter(pk=campaign.pk, status=CampaignStatus.DRAFT).update(
        status=CampaignStatus.SENDING,
        recipient_filter=recipient_filter,
        recipient_count=get_recipient_count(recipient_filter),
        sender=request.user,
    )
    if not claimed:
        return Response({"detail": _("This email is already on its way.")}, status=status.HTTP_409_CONFLICT)
    from .tasks import send_platform_campaign_emails

    send_platform_campaign_emails.delay(campaign.id)
    campaign.refresh_from_db()
    return Response(PlatformEmailCampaignSerializer(campaign).data)


@api_view(["POST"])
@permission_classes([IsSuperUser])
def campaign_test(request, pk: int):
    from .tasks import send_one

    campaign = get_object_or_404(PlatformEmailCampaign, pk=pk)
    subject = _("[Test] %(subject)s") % {"subject": campaign.subject}
    if not send_one(campaign, to=request.user.email, name=request.user.name or "", subject=subject):
        return Response({"detail": _("The test email could not be sent.")}, status=status.HTTP_502_BAD_GATEWAY)
    return Response({"sent_to": request.user.email})


@api_view(["GET"])
@permission_classes([IsSuperUser])
def campaign_recipients(_request, pk: int):
    campaign = get_object_or_404(PlatformEmailCampaign, pk=pk)
    return Response({"results": PlatformCampaignRecipientSerializer(campaign.recipients.all(), many=True).data})
