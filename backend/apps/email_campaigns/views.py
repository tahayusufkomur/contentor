import hashlib
import json
import logging

from django.core.cache import cache
from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.models import TenantUsage
from apps.core.permissions import IsCoachOrOwner

from . import brand, catalog, images, starters
from .models import CampaignStatus, EmailCampaign, EmailDesignJob, EmailTemplate, TemplateSource
from .recipients import get_recipient_count
from .render import personalize
from .serializers import (
    CampaignRecipientSerializer,
    DesignerStartSerializer,
    DraftCreateSerializer,
    DraftUpdateSerializer,
    EmailCampaignListSerializer,
    EmailCampaignSerializer,
    EmailTemplateListSerializer,
    EmailTemplateSerializer,
    RenderSerializer,
    SendSerializer,
)

logger = logging.getLogger(__name__)

PREVIEW_SECONDS = 600
TESTS_PER_HOUR = 20
# What a preview fills the merge variables with: a reader's name, and an unsubscribe link that goes nowhere.
SAMPLE = {"FirstName": "Alex", "Name": "Alex", "UnsubscribeUrl": "#"}


def _preview(design, kit_, subject=""):
    """A template card's preview HTML, cached by what it depends on (the design and her brand)."""
    key = "email-preview:" + hashlib.sha256(json.dumps([design, kit_, subject], sort_keys=True).encode()).hexdigest()
    html = cache.get(key)
    if html is None:
        html, _text, _warnings = brand.build(design, connection.tenant, subject=subject, kit_=kit_)
        html = personalize(html, SAMPLE)
        cache.set(key, html, PREVIEW_SECONDS)
    return html


# ── her brand, her catalog, her pictures ────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def brand_view(_request):
    return Response(brand.kit(connection.tenant))


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def catalog_view(_request):
    tenant = connection.tenant
    return Response({"items": catalog.items(tenant), "slots": catalog.slots(tenant)})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def image_view(request):
    """A photo from her library (or the catalog, already copied into it) as an email picture."""
    from apps.media.models import Photo

    photo = Photo.objects.filter(pk=request.data.get("photo_id")).first() if request.data.get("photo_id") else None
    if photo is None or not photo.s3_key:
        return Response({"detail": "Photo not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(
        {
            "src": images.stable_url_for(photo, site=catalog.site_of(connection.tenant)),
            "alt": photo.alt_text or photo.title or "",
            "width": photo.width,
            "height": photo.height,
        }
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def render_view(request):
    """The email as an inbox will show it (the editor's preview)."""
    serializer = RenderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    html, text, warnings = brand.build(
        data["design"], connection.tenant, subject=data["subject"], preheader=data["preheader"]
    )
    return Response({"html": personalize(html, SAMPLE), "text": personalize(text, SAMPLE), "warnings": warnings})


# ── templates ───────────────────────────────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def template_list(request):
    tenant = connection.tenant
    if request.method == "POST":
        serializer = EmailTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save(source=TemplateSource.COACH)
        return Response(EmailTemplateSerializer(template).data, status=status.HTTP_201_CREATED)

    try:
        starters.ensure(tenant)
    except Exception:  # noqa: BLE001 — her own templates still list
        logger.exception("starter emails could not be made for %s", tenant.schema_name)
    kit_ = brand.kit(tenant)
    rows = []
    # The ones made for her at setup first, in the order they were made; then hers, newest first.
    starters_first = [
        *EmailTemplate.objects.filter(source=TemplateSource.STARTER).order_by("pk"),
        *EmailTemplate.objects.exclude(source=TemplateSource.STARTER),
    ]
    for template in starters_first:
        row = EmailTemplateListSerializer(template).data
        try:
            row["preview_html"] = _preview(template.design, kit_, template.subject)
        except Exception:  # noqa: BLE001 — one broken design must not hide the rest
            logger.exception("template %s preview failed", template.pk)
            row["preview_html"] = ""
        rows.append(row)
    return Response({"results": rows})


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def template_detail(request, pk: int):
    template = get_object_or_404(EmailTemplate, pk=pk)
    if request.method == "DELETE":
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "PATCH":
        serializer = EmailTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(EmailTemplateSerializer(template).data)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def template_duplicate(_request, pk: int):
    source = get_object_or_404(EmailTemplate, pk=pk)
    copy_ = EmailTemplate.objects.create(
        name=f"{source.name} (copy)"[:120],
        category=source.category,
        design=source.design,
        subject=source.subject,
        preheader=source.preheader,
        source=TemplateSource.COACH,
    )
    return Response(EmailTemplateSerializer(copy_).data, status=status.HTTP_201_CREATED)


# ── emails (drafts, then their sends) ───────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def campaign_list(request):
    if request.method == "POST":
        return _create_draft(request)
    campaigns = EmailCampaign.objects.select_related("sender", "template").defer("rendered_html", "design")
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
    return Response({"count": total, "results": EmailCampaignListSerializer(page, many=True).data})


def _create_draft(request):
    serializer = DraftCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    template = None
    if data.get("template_id"):
        template = EmailTemplate.objects.filter(pk=data["template_id"]).first()
        if template is None:
            return Response({"detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    campaign = EmailCampaign.objects.create(
        status=CampaignStatus.DRAFT,
        template=template,
        design=template.design if template else starters.blank_design(),
        subject=data.get("subject") or (template.subject if template else ""),
        preheader=template.preheader if template else "",
        recipient_filter=data.get("recipient_filter") or {"type": "all"},
        sender=request.user,
    )
    return Response(EmailCampaignSerializer(campaign).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def campaign_detail(request, pk: int):
    campaign = get_object_or_404(EmailCampaign.objects.select_related("sender", "template"), pk=pk)
    if request.method == "DELETE":
        # A draft or a not-yet-sent scheduled email can go; anything that went out is history.
        if campaign.status not in (CampaignStatus.DRAFT, CampaignStatus.SCHEDULED):
            return Response(
                {"detail": "Only drafts and scheduled emails can be deleted."}, status=status.HTTP_400_BAD_REQUEST
            )
        campaign.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "PATCH":
        if campaign.status == CampaignStatus.SCHEDULED:
            # Editing a scheduled email takes it back to a draft until she schedules it again.
            campaign.status = CampaignStatus.DRAFT
            campaign.scheduled_at = None
        elif campaign.status != CampaignStatus.DRAFT:
            return Response({"detail": "This email was already sent."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = DraftUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(campaign, field, value)
        campaign.save()
    return Response(EmailCampaignSerializer(campaign).data)


def _quota_left(tenant, count):
    """Whether this month's plan quota covers `count` more emails."""
    month_start = timezone.now().date().replace(day=1)
    usage, _ = TenantUsage.objects.get_or_create(tenant=tenant, month=month_start)
    quota = tenant.plan and tenant.plan.max_campaign_emails
    return not quota or usage.emails_sent + count <= quota


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def campaign_send(request, pk: int):
    campaign = get_object_or_404(EmailCampaign, pk=pk)
    if campaign.status != CampaignStatus.DRAFT:
        return Response({"detail": "This email is already on its way."}, status=status.HTTP_409_CONFLICT)
    if not campaign.subject.strip():
        return Response({"detail": "Give your email a subject first."}, status=status.HTTP_400_BAD_REQUEST)
    if not any(brand.blocks_of(campaign.design)):
        return Response({"detail": "This email is empty."}, status=status.HTTP_400_BAD_REQUEST)
    serializer = SendSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    recipient_count = get_recipient_count(data["recipient_filter"])
    tenant = connection.tenant
    if not _quota_left(tenant, recipient_count):
        return Response({"detail": "Email quota exceeded for this month."}, status=status.HTTP_403_FORBIDDEN)

    scheduled_at = data.get("scheduled_at")
    claimed = EmailCampaign.objects.filter(pk=campaign.pk, status=CampaignStatus.DRAFT).update(
        status=CampaignStatus.SCHEDULED if scheduled_at else CampaignStatus.SENDING,
        scheduled_at=scheduled_at,
        recipient_filter=data["recipient_filter"],
        recipient_count=recipient_count,
        sender=request.user,
        template_name=campaign.template.name if campaign.template_id else "",
    )
    if not claimed:  # a double click: the first one sends it
        return Response({"detail": "This email is already on its way."}, status=status.HTTP_409_CONFLICT)
    if not scheduled_at:
        from .tasks import send_campaign_emails

        send_campaign_emails.delay(campaign.id, tenant.schema_name)
    campaign.refresh_from_db()
    return Response(EmailCampaignSerializer(campaign).data)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def recipient_count(request):
    """How many students a filter reaches now (students who unsubscribed left out), for the send step."""
    from .serializers import validate_recipient_filter

    try:
        recipient_filter = validate_recipient_filter(request.data.get("recipient_filter"), require_recipients=False)
    except ValidationError as e:
        return Response({"detail": e.detail}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"count": get_recipient_count(recipient_filter)})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def campaign_test(request, pk: int):
    """The email, as her students will get it, to her own inbox."""
    from .tasks import send_one

    campaign = get_object_or_404(EmailCampaign, pk=pk)
    key = f"email-tests:{connection.schema_name}:{request.user.pk}:{timezone.now():%Y%m%d%H}"
    if cache.get_or_set(key, 0, 3600) >= TESTS_PER_HOUR:
        return Response({"detail": "That's a lot of tests. Try again in an hour."}, status=429)
    cache.incr(key)
    ok = send_one(
        campaign,
        connection.tenant,
        to=request.user.email,
        name=request.user.name or "",
        subject=f"[Test] {campaign.subject or '(no subject)'}",
    )
    if not ok:
        return Response({"detail": "The test email could not be sent."}, status=status.HTTP_502_BAD_GATEWAY)
    return Response({"sent_to": request.user.email})


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def campaign_recipients(_request, pk: int):
    campaign = get_object_or_404(EmailCampaign, pk=pk)
    return Response({"results": CampaignRecipientSerializer(campaign.recipients.all(), many=True).data})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def campaign_save_as_template(request, pk: int):
    campaign = get_object_or_404(EmailCampaign, pk=pk)
    name = str(request.data.get("name") or campaign.subject or "My template").strip()[:120]
    template = EmailTemplate.objects.create(
        name=name,
        category=(campaign.template.category if campaign.template else "other"),
        design=campaign.design,
        subject=campaign.subject,
        preheader=campaign.preheader,
        source=TemplateSource.COACH,
    )
    return Response(EmailTemplateSerializer(template).data, status=status.HTTP_201_CREATED)


# ── the Designer ───────────────────────────────────────────────────────────────────────────────


def _job_data(job):
    return {
        "id": job.id,
        "status": job.status,
        "step": job.step,
        "warnings": job.warnings,
        "error": job.error,
        "campaign": job.campaign_id,
        "template": job.template_id,
    }


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def designer_start(request):
    from . import designer

    serializer = DesignerStartSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    campaign = get_object_or_404(EmailCampaign, pk=data["campaign_id"]) if data.get("campaign_id") else None
    template = get_object_or_404(EmailTemplate, pk=data["template_id"]) if data.get("template_id") else None
    if campaign is not None and campaign.status != CampaignStatus.DRAFT:
        return Response({"detail": "This email was already sent."}, status=status.HTTP_400_BAD_REQUEST)
    ok, reason = designer.available()
    if not ok:
        return Response({"detail": "The Designer isn't available right now.", "reason": reason}, status=503)
    job = designer.start(
        user=request.user,
        campaign=campaign,
        template=template,
        brief=data["brief"],
        mode=data["mode"],
        block_id=data.get("block_id") or "",
        refs=data.get("refs") or [],
    )
    return Response(_job_data(job), status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def designer_job(_request, pk: int):
    from . import designer

    job = get_object_or_404(EmailDesignJob, pk=pk)
    designer.sweep(job)
    return Response(_job_data(job))
