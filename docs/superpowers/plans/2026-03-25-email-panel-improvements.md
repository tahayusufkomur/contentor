# Email Panel Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the email campaigns admin panel with visual template previews, a 3-step compose flow that eliminates duplicate templates, and campaign detail with per-recipient tracking.

**Architecture:** Backend adds `CampaignRecipient` model, new EmailCraft client functions (`create_template`, `export_html`), and three new endpoints (template copy, template preview batch, campaign recipients). Frontend refactors templates page and compose flow using shared `TemplateCard` and `TemplateGrid` components, adds campaign detail page with email preview and recipient table.

**Tech Stack:** Django REST Framework, Celery, EmailCraft API, Next.js 14 App Router, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-25-email-panel-improvements-design.md`

---

## File Structure

### Backend — Modified Files

| File | Change |
|---|---|
| `backend/apps/email_campaigns/models.py` | Add `CampaignRecipient` model, add `rendered_html` + `recipient_summary` fields to `EmailCampaign`, change sender FK to `SET_NULL` |
| `backend/apps/email_campaigns/emailcraft_client.py` | Add `create_template()` and `export_html()` functions |
| `backend/apps/email_campaigns/views.py` | Add `copy_template`, `template_preview_batch`, `campaign_recipients` views |
| `backend/apps/email_campaigns/serializers.py` | Add `CampaignRecipientSerializer`, `CopyTemplateSerializer`, `PreviewTemplateSerializer`; update `EmailCampaignSerializer` with new fields |
| `backend/apps/email_campaigns/urls.py` | Add routes for new endpoints |
| `backend/apps/email_campaigns/tasks.py` | Create `CampaignRecipient` rows per send, store `rendered_html` + `recipient_summary` |

### Frontend — New Files

| File | Responsibility |
|---|---|
| `frontend-customer/src/components/admin/email/template-card.tsx` | Shared template card with mini HTML preview iframe |
| `frontend-customer/src/components/admin/email/template-grid.tsx` | Shared grid with search bar, category filter pills, card layout |
| `frontend-customer/src/app/admin/email/campaigns/[id]/page.tsx` | Campaign detail page with email preview + recipient table |

### Frontend — Modified Files

| File | Change |
|---|---|
| `frontend-customer/src/lib/email-api.ts` | Add `copyTemplate()`, `previewTemplates()`, `listCampaignRecipients()`, `getCampaign()` types |
| `frontend-customer/src/app/admin/email/templates/page.tsx` | Rewrite with `TemplateGrid` component |
| `frontend-customer/src/app/admin/email/compose/page.tsx` | Rewrite as 3-step flow |
| `frontend-customer/src/app/admin/email/page.tsx` | Add filter bar, clickable rows |

---

## Chunk 1: Backend Foundation

### Task 1: EmailCampaign Model Changes + CampaignRecipient Model

**Files:**
- Modify: `backend/apps/email_campaigns/models.py`

- [ ] **Step 1: Update EmailCampaign model**

Add `rendered_html`, `recipient_summary` fields and change `sender` FK to `SET_NULL`:

```python
# In models.py, update EmailCampaign class:

class EmailCampaign(models.Model):
    subject = models.CharField(max_length=255)
    template_id = models.CharField(max_length=255)
    template_name = models.CharField(max_length=255, blank=True, default="")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_campaigns",
    )
    recipient_filter = models.JSONField()
    recipient_count = models.IntegerField(default=0)
    success_count = models.IntegerField(default=0)
    failure_count = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=CampaignStatus.choices,
        default=CampaignStatus.SENDING,
    )
    rendered_html = models.TextField(blank=True, default="")
    recipient_summary = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "email_campaigns"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject} ({self.status})"
```

- [ ] **Step 2: Add CampaignRecipient model**

Add below `EmailCampaign` in the same file:

```python
class RecipientStatus(models.TextChoices):
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"


class CampaignRecipient(models.Model):
    campaign = models.ForeignKey(
        EmailCampaign,
        on_delete=models.CASCADE,
        related_name="recipients",
    )
    user_id = models.IntegerField()
    user_name = models.CharField(max_length=255, blank=True, default="")
    user_email = models.EmailField()
    status = models.CharField(
        max_length=10,
        choices=RecipientStatus.choices,
    )
    error_message = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "email_campaigns"
        ordering = ["id"]

    def __str__(self):
        return f"{self.user_email} ({self.status})"
```

- [ ] **Step 3: Generate and run migration**

Run:
```bash
cd /Users/tahayusufkomur/ws/workdir-contentor-customerapp/contentor
docker compose exec django python manage.py makemigrations email_campaigns
docker compose exec django python manage.py migrate_schemas --tenant
```

- [ ] **Step 4: Verify migration**

Run:
```bash
docker compose exec django python manage.py showmigrations email_campaigns
```
Expected: All migrations checked.

### Task 2: New EmailCraft Client Functions

**Files:**
- Modify: `backend/apps/email_campaigns/emailcraft_client.py`

- [ ] **Step 1: Add `create_template` function**

Add after the `delete_template` function:

```python
def create_template(api_key: str, name: str, json_data: dict, category: str = "") -> dict:
    payload: dict = {"name": name, "json_data": json_data}
    if category:
        payload["category"] = category
    response = _request_with_fallback(
        "POST",
        ["/api/templates", "/api/v1/templates"],
        headers=_org_headers(api_key),
        timeout=15,
        json=payload,
    )
    return response.json()
```

- [ ] **Step 2: Add `export_html` function**

Add after `create_template`:

```python
def export_html(api_key: str, json_data: dict, variables_mode: str = "defaults") -> dict:
    response = _request_with_fallback(
        "POST",
        ["/api/export/html", "/api/v1/export/html"],
        headers=_org_headers(api_key),
        timeout=10,
        json={"json_data": json_data, "variables_mode": variables_mode},
        fallback_status_codes={404, 405},
    )
    return response.json()
```

- [ ] **Step 3: Verify client loads**

Run:
```bash
docker compose exec django python -c "from apps.email_campaigns import emailcraft_client; print('OK')"
```

### Task 3: New Serializers

**Files:**
- Modify: `backend/apps/email_campaigns/serializers.py`

- [ ] **Step 1: Add CampaignRecipientSerializer**

Add to the file:

```python
from .models import CampaignRecipient, EmailCampaign


class CampaignRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignRecipient
        fields = [
            "id",
            "user_id",
            "user_name",
            "user_email",
            "status",
            "error_message",
            "sent_at",
        ]
        read_only_fields = fields
```

- [ ] **Step 2: Add CopyTemplateSerializer and PreviewTemplateSerializer**

```python
class CopyTemplateSerializer(serializers.Serializer):
    source_template_id = serializers.CharField(max_length=255)


class PreviewTemplateSerializer(serializers.Serializer):
    template_ids = serializers.ListField(
        child=serializers.CharField(max_length=255),
        min_length=1,
        max_length=20,
    )
```

- [ ] **Step 3: Update EmailCampaignSerializer with new fields**

Add `rendered_html` and `recipient_summary` to the fields list and handle nullable sender:

```python
class EmailCampaignSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_email = serializers.SerializerMethodField()

    class Meta:
        model = EmailCampaign
        fields = [
            "id",
            "subject",
            "template_id",
            "template_name",
            "sender",
            "sender_name",
            "sender_email",
            "recipient_filter",
            "recipient_count",
            "success_count",
            "failure_count",
            "status",
            "rendered_html",
            "recipient_summary",
            "created_at",
            "sent_at",
        ]
        read_only_fields = fields

    def get_sender_name(self, obj):
        return obj.sender.name if obj.sender else ""

    def get_sender_email(self, obj):
        return obj.sender.email if obj.sender else ""
```

### Task 4: New Backend Views + URL Routes

**Files:**
- Modify: `backend/apps/email_campaigns/views.py`
- Modify: `backend/apps/email_campaigns/urls.py`

- [ ] **Step 1: Add copy_template view**

Add to `views.py`:

```python
@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copy_template(request):
    from .serializers import CopyTemplateSerializer

    serializer = CopyTemplateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    api_key, error = _get_api_key()
    if error or not api_key:
        return Response({"detail": error or "Email service unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    source_id = serializer.validated_data["source_template_id"]

    try:
        source = emailcraft_client.get_template(api_key, source_id)
    except Exception:
        logger.exception("Failed to fetch source template %s", source_id)
        return Response({"detail": "Source template not found."}, status=status.HTTP_404_NOT_FOUND)

    source_name = source.get("name", "Untitled")
    source_json = source.get("json_data", {})
    source_category = source.get("category", "")

    try:
        result = emailcraft_client.create_template(
            api_key,
            name=f"Copy of {source_name}",
            json_data=source_json,
            category=source_category,
        )
        return Response(
            {"id": result.get("id", ""), "name": result.get("name", "")},
            status=status.HTTP_201_CREATED,
        )
    except Exception:
        logger.exception("Failed to create template copy")
        return Response({"detail": "Failed to copy template."}, status=status.HTTP_502_BAD_GATEWAY)
```

- [ ] **Step 2: Add template_preview_batch view**

```python
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def template_preview_batch(request):
    from .serializers import PreviewTemplateSerializer

    serializer = PreviewTemplateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    api_key, error = _get_api_key()
    if error or not api_key:
        return Response({"detail": error or "Email service unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    template_ids = serializer.validated_data["template_ids"]
    previews: dict[str, str] = {}
    errors: dict[str, str] = {}

    def render_one(tid: str) -> tuple[str, str | None, str | None]:
        try:
            tmpl = emailcraft_client.get_template(api_key, tid)
            json_data = tmpl.get("json_data")
            if not json_data:
                return tid, None, "No template data"
            result = emailcraft_client.export_html(api_key, json_data, "defaults")
            return tid, result.get("html", ""), None
        except Exception as exc:
            return tid, None, str(exc)[:200]

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(render_one, tid): tid for tid in template_ids}
        for future in futures:
            try:
                tid, html, err = future.result(timeout=10)
                if html:
                    previews[tid] = html
                elif err:
                    errors[tid] = err
            except FuturesTimeoutError:
                errors[futures[future]] = "Render timed out"
            except Exception as exc:
                errors[futures[future]] = str(exc)[:200]

    return Response({"previews": previews, "errors": errors})
```

- [ ] **Step 3: Add campaign_recipients view**

```python
@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def campaign_recipients(request, pk: int):
    from .models import CampaignRecipient
    from .serializers import CampaignRecipientSerializer

    campaign = EmailCampaign.objects.filter(pk=pk).first()
    if not campaign:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    recipients = CampaignRecipient.objects.filter(campaign=campaign)
    return Response({"results": CampaignRecipientSerializer(recipients, many=True).data})
```

- [ ] **Step 4: Add URL routes**

Update `urls.py` to add the three new routes:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("setup/", views.setup_email, name="email-setup"),
    path("session/", views.create_session, name="email-session"),
    path("templates/", views.template_list, name="email-template-list"),
    path("templates/copy/", views.copy_template, name="email-template-copy"),
    path("templates/preview/", views.template_preview_batch, name="email-template-preview"),
    path("templates/<str:template_id>/", views.template_detail, name="email-template-detail"),
    path("gallery/", views.gallery_list, name="email-gallery-list"),
    path("send/", views.send_campaign, name="email-send"),
    path("campaigns/", views.campaign_list, name="email-campaign-list"),
    path("campaigns/<int:pk>/", views.campaign_detail, name="email-campaign-detail"),
    path("campaigns/<int:pk>/recipients/", views.campaign_recipients, name="email-campaign-recipients"),
]
```

Note: `templates/copy/` and `templates/preview/` must come BEFORE `templates/<str:template_id>/` to avoid the str parameter swallowing "copy" and "preview".

- [ ] **Step 5: Verify server starts**

Run:
```bash
docker compose restart django && sleep 5 && docker compose logs django --tail 5
```

### Task 5: Update Celery Task for Per-Recipient Tracking

**Files:**
- Modify: `backend/apps/email_campaigns/tasks.py`

- [ ] **Step 1: Update the send loop to create CampaignRecipient rows and store rendered_html + recipient_summary**

Replace the entire task function. Key changes:
- Import `CampaignRecipient` and `RecipientStatus`
- Generate `recipient_summary` from the filter before sending
- After rendering the first recipient, store `rendered_html` on the campaign
- Create a `CampaignRecipient` row after each send attempt
- Keep the existing `success_count`/`failure_count` updates

```python
import logging

from celery import shared_task
from django.db.models import F
from django.utils import timezone
from django_tenants.utils import tenant_context
from requests import HTTPError

from apps.core.email import send_email

logger = logging.getLogger(__name__)


def _build_recipient_summary(recipient_filter: dict, tenant_context_active: bool = True) -> str:
    """Build a human-readable summary of the recipient filter."""
    filter_type = recipient_filter.get("type", "")
    if filter_type == "all":
        return "All students"
    if filter_type == "course":
        course_ids = recipient_filter.get("course_ids") or []
        if not course_ids:
            return "No courses selected"
        try:
            from apps.courses.models import Course
            names = list(
                Course.objects.filter(pk__in=course_ids).values_list("title", flat=True)
            )
            return ", ".join(names) if names else f"{len(course_ids)} course(s)"
        except Exception:
            return f"{len(course_ids)} course(s)"
    if filter_type == "individual":
        user_ids = recipient_filter.get("user_ids") or []
        return f"{len(user_ids)} selected student(s)"
    return ""


@shared_task(bind=True, max_retries=0)
def send_campaign_emails(_self, campaign_id: int, schema_name: str):
    """
    Render + send a campaign inside the tenant schema.
    TenantUsage is updated in the public schema after completion.
    """
    from apps.core.models import Tenant, TenantUsage

    try:
        tenant = Tenant.objects.select_related("plan").get(schema_name=schema_name)
    except Tenant.DoesNotExist:
        logger.error("Tenant %s not found for campaign %s", schema_name, campaign_id)
        return

    success = 0
    failure = 0

    try:
        with tenant_context(tenant):
            from apps.courses.models import Course
            from apps.email_campaigns.models import (
                CampaignRecipient,
                CampaignStatus,
                EmailCampaign,
                RecipientStatus,
            )
            from apps.email_campaigns.recipients import resolve_recipients
            from apps.tenant_config.models import TenantConfig

            campaign = EmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
            if not campaign:
                logger.error("Campaign %s not found", campaign_id)
                return

            config = TenantConfig.objects.first()
            if not config or not config.emailcraft_api_key:
                campaign.status = CampaignStatus.FAILED
                campaign.sent_at = timezone.now()
                campaign.save(update_fields=["status", "sent_at"])
                logger.error("No EmailCraft API key for campaign %s", campaign_id)
                return

            api_key = config.emailcraft_api_key
            brand_name = config.brand_name
            coach_name = (campaign.sender.name or campaign.sender.email) if campaign.sender else "Coach"
            from_name = f"{coach_name} via {brand_name}"

            recipients = list(resolve_recipients(campaign.recipient_filter).values("id", "name", "email"))
            recipient_count = len(recipients)

            course_name = ""
            recipient_filter = campaign.recipient_filter
            if recipient_filter.get("type") == "course":
                course_ids = recipient_filter.get("course_ids") or []
                if len(course_ids) == 1:
                    course = Course.objects.filter(pk=course_ids[0]).first()
                    if course:
                        course_name = course.title

            if not course_name:
                course_name = "General"

            # Build recipient summary
            summary = _build_recipient_summary(recipient_filter)
            campaign.recipient_summary = summary
            campaign.save(update_fields=["recipient_summary"])

        today = timezone.now().date()
        month_start = today.replace(day=1)
        usage, _ = TenantUsage.objects.get_or_create(tenant=tenant, month=month_start)

        remaining_quota = None
        if tenant.plan and tenant.plan.max_campaign_emails:
            remaining_quota = max(tenant.plan.max_campaign_emails - usage.emails_sent, 0)

        with tenant_context(tenant):
            from apps.email_campaigns import emailcraft_client
            from apps.email_campaigns.models import (
                CampaignRecipient,
                CampaignStatus,
                EmailCampaign,
                RecipientStatus,
            )

            campaign = EmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
            if not campaign:
                logger.error("Campaign %s not found during send phase", campaign_id)
                return

            campaign.recipient_count = recipient_count

            for idx, recipient in enumerate(recipients):
                if remaining_quota is not None and success >= remaining_quota:
                    # Create failed recipients for remaining
                    remaining = recipients[idx:]
                    CampaignRecipient.objects.bulk_create([
                        CampaignRecipient(
                            campaign=campaign,
                            user_id=r["id"],
                            user_name=r["name"] or "",
                            user_email=r["email"] or "",
                            status=RecipientStatus.FAILED,
                            error_message="Email quota exceeded",
                        )
                        for r in remaining
                    ])
                    failure += len(remaining)
                    logger.warning("Quota reached mid-batch for campaign %s", campaign_id)
                    break

                try:
                    variables = {
                        "student_name": (recipient["name"] or recipient["email"] or "Student"),
                        "student_email": recipient["email"] or "unknown@example.com",
                        "course_name": course_name,
                        "coach_name": coach_name or "Coach",
                        "brand_name": brand_name or "Brand",
                    }
                    rendered = emailcraft_client.render_template(api_key, campaign.template_id, variables)
                    html = rendered.get("html", "")

                    # Store first recipient's rendered HTML as campaign preview
                    if idx == 0 and html and not campaign.rendered_html:
                        campaign.rendered_html = html
                        campaign.save(update_fields=["rendered_html"])

                    sent = send_email(
                        to=recipient["email"],
                        subject=campaign.subject,
                        html=html,
                        from_name=from_name,
                    )
                    if sent:
                        success += 1
                        CampaignRecipient.objects.create(
                            campaign=campaign,
                            user_id=recipient["id"],
                            user_name=recipient["name"] or "",
                            user_email=recipient["email"] or "",
                            status=RecipientStatus.SENT,
                            sent_at=timezone.now(),
                        )
                    else:
                        failure += 1
                        CampaignRecipient.objects.create(
                            campaign=campaign,
                            user_id=recipient["id"],
                            user_name=recipient["name"] or "",
                            user_email=recipient["email"] or "",
                            status=RecipientStatus.FAILED,
                            error_message="Send returned false",
                        )
                except HTTPError as exc:
                    response_text = ""
                    if exc.response is not None:
                        response_text = (exc.response.text or "")[:2000]
                    logger.exception(
                        "EmailCraft render/send HTTP error for %s campaign %s: %s",
                        recipient.get("email"),
                        campaign_id,
                        response_text,
                    )
                    failure += 1
                    CampaignRecipient.objects.create(
                        campaign=campaign,
                        user_id=recipient["id"],
                        user_name=recipient["name"] or "",
                        user_email=recipient["email"] or "",
                        status=RecipientStatus.FAILED,
                        error_message=response_text[:500] or "HTTP error during render/send",
                    )
                except Exception as exc:
                    logger.exception(
                        "Failed to send email to %s for campaign %s",
                        recipient.get("email"),
                        campaign_id,
                    )
                    failure += 1
                    CampaignRecipient.objects.create(
                        campaign=campaign,
                        user_id=recipient["id"],
                        user_name=recipient["name"] or "",
                        user_email=recipient["email"] or "",
                        status=RecipientStatus.FAILED,
                        error_message=str(exc)[:500],
                    )

            campaign.success_count = success
            campaign.failure_count = failure
            campaign.sent_at = timezone.now()

            if success == 0:
                campaign.status = CampaignStatus.FAILED
            elif failure == 0:
                campaign.status = CampaignStatus.SENT
            else:
                campaign.status = CampaignStatus.PARTIAL

            campaign.save(
                update_fields=[
                    "recipient_count",
                    "success_count",
                    "failure_count",
                    "status",
                    "sent_at",
                ]
            )

        if success > 0:
            TenantUsage.objects.filter(tenant=tenant, month=month_start).update(emails_sent=F("emails_sent") + success)

        logger.info("Campaign %s complete: %d sent, %d failed", campaign_id, success, failure)

    except Exception:
        logger.exception("Unexpected error while sending campaign %s", campaign_id)
        with tenant_context(tenant):
            from apps.email_campaigns.models import CampaignStatus, EmailCampaign

            campaign = EmailCampaign.objects.filter(pk=campaign_id).first()
            if campaign:
                campaign.status = CampaignStatus.FAILED
                campaign.sent_at = timezone.now()
                campaign.save(update_fields=["status", "sent_at"])
```

- [ ] **Step 2: Restart Celery worker**

Run:
```bash
docker compose restart celery-worker
```

- [ ] **Step 3: Verify backend starts cleanly**

Run:
```bash
docker compose restart django celery-worker && sleep 5 && docker compose logs django --tail 3 && docker compose logs celery-worker --tail 3
```

---

## Chunk 2: Frontend API Client + Shared Components

### Task 6: Update Frontend API Client

**Files:**
- Modify: `frontend-customer/src/lib/email-api.ts`

- [ ] **Step 1: Add new API functions and update types**

Add these functions to the end of `email-api.ts`:

```typescript
export async function copyTemplate(sourceTemplateId: string): Promise<{ id: string; name: string }> {
  return clientFetch<{ id: string; name: string }>("/api/v1/email/templates/copy/", {
    method: "POST",
    body: JSON.stringify({ source_template_id: sourceTemplateId }),
  });
}

export async function previewTemplates(
  templateIds: string[],
): Promise<{ previews: Record<string, string>; errors: Record<string, string> }> {
  return clientFetch<{ previews: Record<string, string>; errors: Record<string, string> }>(
    "/api/v1/email/templates/preview/",
    {
      method: "POST",
      body: JSON.stringify({ template_ids: templateIds }),
    },
  );
}

export async function listCampaignRecipients(
  campaignId: number,
): Promise<{ results: CampaignRecipientEntry[] }> {
  return clientFetch<{ results: CampaignRecipientEntry[] }>(
    `/api/v1/email/campaigns/${campaignId}/recipients/`,
  );
}
```

- [ ] **Step 2: Add CampaignRecipientEntry type**

Add near the other type definitions:

```typescript
export interface CampaignRecipientEntry {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  status: "sent" | "failed";
  error_message: string;
  sent_at: string | null;
}
```

- [ ] **Step 3: Update EmailCampaign type with new fields**

Add `rendered_html` and `recipient_summary` to the `EmailCampaign` interface:

```typescript
export interface EmailCampaign {
  id: number;
  subject: string;
  template_id: string;
  template_name: string;
  sender: number | null;
  sender_name: string;
  sender_email: string;
  recipient_filter: RecipientFilter;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  status: "sending" | "sent" | "partial" | "failed";
  rendered_html: string;
  recipient_summary: string;
  created_at: string;
  sent_at: string | null;
}
```

### Task 7: Template Card Component

**Files:**
- Create: `frontend-customer/src/components/admin/email/template-card.tsx`

- [ ] **Step 1: Create TemplateCard component**

```typescript
"use client";

import type { EmailTemplate } from "@/lib/email-api";

interface TemplateCardProps {
  template: EmailTemplate;
  previewHtml?: string;
  mode: "library" | "picker";
  loading?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPreview?: () => void;
}

export function TemplateCard({
  template,
  previewHtml,
  mode,
  loading,
  onSelect,
  onEdit,
  onDelete,
  onPreview,
}: TemplateCardProps) {
  const isGallery = (template as Record<string, unknown>).template_type === "provided";
  const category = (template as Record<string, unknown>).category as string | undefined;

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md ${
        mode === "picker" ? "cursor-pointer" : ""
      }`}
      onClick={mode === "picker" ? onSelect : undefined}
    >
      {/* Preview area */}
      <div className="relative h-[200px] overflow-hidden bg-muted/20">
        {previewHtml ? (
          <div className="h-[500px] w-[600px] origin-top-left scale-[0.38]">
            <iframe
              srcDoc={previewHtml}
              sandbox=""
              className="h-full w-full border-0"
              title={`Preview of ${template.name}`}
              style={{ pointerEvents: "none" }}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No preview available
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <p className="text-sm text-muted-foreground">Copying template...</p>
          </div>
        )}

        {/* Hover overlay — library mode */}
        {mode === "library" && !loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100"
              >
                Edit
              </button>
            )}
            {onPreview && (
              <button
                onClick={(e) => { e.stopPropagation(); onPreview(); }}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100"
              >
                Preview
              </button>
            )}
            {onDelete && !isGallery && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            )}
          </div>
        )}

        {/* Hover overlay — picker mode */}
        {mode === "picker" && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Use Template
            </span>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium">{template.name}</p>
        <div className="flex items-center gap-2">
          {category && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
              {category}
            </span>
          )}
          {isGallery && (
            <span className="text-[10px] text-muted-foreground">Gallery</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Task 8: Template Grid Component

**Files:**
- Create: `frontend-customer/src/components/admin/email/template-grid.tsx`

- [ ] **Step 1: Create TemplateGrid component**

```typescript
"use client";

import { useMemo, useState } from "react";

import type { EmailTemplate } from "@/lib/email-api";
import { TemplateCard } from "./template-card";

const CATEGORIES = ["All", "Welcome", "Newsletter", "Promotional", "Transactional", "Event"];

interface TemplateGridProps {
  templates: EmailTemplate[];
  previewHtmlMap: Record<string, string>;
  mode: "library" | "picker";
  loadingTemplateId?: string | null;
  onSelect?: (template: EmailTemplate) => void;
  onEdit?: (template: EmailTemplate) => void;
  onDelete?: (template: EmailTemplate) => void;
  onPreview?: (template: EmailTemplate) => void;
  showStartFromScratch?: boolean;
  onStartFromScratch?: () => void;
}

export function TemplateGrid({
  templates,
  previewHtmlMap,
  mode,
  loadingTemplateId,
  onSelect,
  onEdit,
  onDelete,
  onPreview,
  showStartFromScratch,
  onStartFromScratch,
}: TemplateGridProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = useMemo(() => {
    let result = templates;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (category !== "All") {
      result = result.filter(
        (t) => ((t as Record<string, unknown>).category as string || "").toLowerCase() === category.toLowerCase(),
      );
    }
    return result;
  }, [templates, search, category]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-64 rounded-md border px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showStartFromScratch && (
          <button
            onClick={onStartFromScratch}
            className="flex h-[260px] items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/10 transition-colors hover:border-primary/50 hover:bg-muted/30"
          >
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-sm font-medium">Start from Scratch</p>
            </div>
          </button>
        )}
        {filtered.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            previewHtml={previewHtmlMap[template.id]}
            mode={mode}
            loading={loadingTemplateId === template.id}
            onSelect={onSelect ? () => onSelect(template) : undefined}
            onEdit={onEdit ? () => onEdit(template) : undefined}
            onDelete={onDelete ? () => onDelete(template) : undefined}
            onPreview={onPreview ? () => onPreview(template) : undefined}
          />
        ))}
      </div>

      {filtered.length === 0 && !showStartFromScratch && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No templates found.
        </p>
      )}
    </div>
  );
}
```

---

## Chunk 3: Frontend Pages

### Task 9: Rewrite Templates Page

**Files:**
- Modify: `frontend-customer/src/app/admin/email/templates/page.tsx`

- [ ] **Step 1: Rewrite the templates page using TemplateGrid**

Replace the entire file with the new implementation that uses `TemplateGrid`, fetches previews via the batch endpoint, and includes a preview modal. The page has two tabs ("My Templates" / "Gallery"), and both render through `TemplateGrid` in "library" mode.

Key behaviors:
- On mount: fetch templates, then call `previewTemplates()` in batches of 20
- Preview modal: full-size iframe with rendered HTML (fetched via `getTemplate` + backend export on click)
- Delete: `window.confirm` → `deleteTemplate()` → remove from state
- Edit: `router.push(/admin/email/compose?template={id})`

The page should keep the existing preview modal pattern (sandboxed iframe) but now the default view is a visual grid.

### Task 10: Rewrite Compose Page as 3-Step Flow

**Files:**
- Modify: `frontend-customer/src/app/admin/email/compose/page.tsx`

- [ ] **Step 1: Rewrite as 3-step compose flow**

Replace the entire file. The new flow:
- **Step 1 (choose):** `TemplateGrid` in "picker" mode. Clicking a template calls `copyTemplate()`, stores the returned `{ id, name }`, and advances to Step 2. "Start from Scratch" advances to Step 2 with no template.
- **Step 2 (design):** `EmailBuilderIframe` loaded with the copy's template ID. "Next" enabled when `savedTemplateId` is known. "Back" returns to Step 1 with confirm. Listens for `MAILCRAFT_TEMPLATE_SAVED` for "Start from Scratch" flow.
- **Step 3 (send):** Subject input + `RecipientSelector` + Send button. Same validation as today. On success → redirect to `/admin/email`.

The page needs to fetch templates and previews for Step 1 (same pattern as templates page). Store the preview map in state so it persists across step changes.

### Task 11: Enhance Campaign Dashboard with Filters + Clickable Rows

**Files:**
- Modify: `frontend-customer/src/app/admin/email/page.tsx`

- [ ] **Step 1: Add filter bar and make rows clickable**

Update the campaigns page:
- Increase `listCampaigns` limit to 100
- Add filter bar at top: search input, status dropdown, date range pills
- All filtering is client-side via `useMemo`
- Table rows wrapped in `<Link>` to `/admin/email/campaigns/{id}`
- Keep existing status badge colors

### Task 12: Create Campaign Detail Page

**Files:**
- Create: `frontend-customer/src/app/admin/email/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create campaign detail page**

New page that:
- Fetches campaign via `getCampaign(id)` on mount
- Fetches recipients via `listCampaignRecipients(id)` on mount
- Top section: campaign metadata (subject, status badge, dates, sender, recipient summary, success/failure counts) + rendered email preview in sandboxed iframe (from `campaign.rendered_html`)
- Bottom section: recipient table with Name, Email, Status badge, Sent At, Error columns
- "Back to Campaigns" link at top
- Handles missing `rendered_html` (old campaigns) with placeholder text
- Handles empty recipients list (old campaigns) with "Recipient tracking not available" message

---

## Chunk 4: Verification

### Task 13: End-to-End Verification

- [ ] **Step 1: Restart all services**

```bash
cd /Users/tahayusufkomur/ws/workdir-contentor-customerapp/contentor
docker compose restart django celery-worker nextjs-customer
```

- [ ] **Step 2: Verify templates page shows preview cards**

Navigate to `/admin/email/templates` — should show a grid of template cards with HTML previews loading progressively. Category filter pills should filter the grid.

- [ ] **Step 3: Verify compose flow**

Navigate to `/admin/email/compose` → should show template picker (Step 1). Pick a template → should show "Copying template..." → advance to builder (Step 2). Click Next → should show send form (Step 3). Fill subject + select recipients → Send → should redirect to dashboard.

- [ ] **Step 4: Verify campaign detail**

Navigate to `/admin/email` → click a campaign row → should show campaign detail page with email preview and recipient table showing per-person delivery status.

- [ ] **Step 5: Verify filters**

On campaign dashboard: test search by subject, status dropdown, date range pills. On templates page: test search and category filters.
