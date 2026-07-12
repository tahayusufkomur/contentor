# Email Campaigns Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email campaign feature where coaches design templates via EmailCraft iframe and send personalized emails to students via Resend.

**Architecture:** New Django app `email_campaigns` proxies all EmailCraft API calls (keeping API keys server-side). EmailCraft stores templates, Django stores only campaign logs. Celery handles async email rendering + sending. Frontend embeds EmailCraft builder via iframe with session tokens.

**Tech Stack:** Django REST Framework, Celery, Resend, EmailCraft API, Next.js 14 App Router, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-email-campaigns-design.md`

---

## File Structure

### Backend — New App: `backend/apps/email_campaigns/`

| File | Responsibility |
|---|---|
| `apps.py` | App config (`email_campaigns` label) |
| `models.py` | `EmailCampaign` model |
| `serializers.py` | Campaign serializers |
| `emailcraft_client.py` | EmailCraft API client (provision, session, templates, render) |
| `recipients.py` | Recipient resolution from filter JSON |
| `views.py` | All API views (session, templates, send, campaigns) |
| `tasks.py` | Celery task for async send |
| `urls.py` | URL routing under `/api/v1/email/` |
| `admin.py` | Django admin registration |

### Backend — Modified Files

| File | Change |
|---|---|
| `backend/config/settings/base.py` | Add `EMAILCRAFT_TOKEN`, `EMAILCRAFT_BASE_URL` settings; add `apps.email_campaigns` to `TENANT_APPS` |
| `backend/config/urls.py` | Add `path("api/v1/email/", include("apps.email_campaigns.urls"))` |
| `backend/apps/core/email.py` | Extend `send_email()` with optional `from_name` parameter |
| `backend/apps/tenant_config/models.py` | Add `emailcraft_api_key` field |
| `backend/apps/tenant_config/serializers.py` | Ensure `emailcraft_api_key` is excluded (already excluded by explicit fields list — verify only) |

### Frontend — New Files in `frontend-customer/src/`

| File | Responsibility |
|---|---|
| `lib/email-api.ts` | API client functions for email endpoints |
| `app/admin/email/page.tsx` | Campaign dashboard (list of sent campaigns) |
| `app/admin/email/templates/page.tsx` | Template library + gallery browser |
| `app/admin/email/compose/page.tsx` | Two-step compose flow (design + send) |
| `components/admin/email/email-builder-iframe.tsx` | EmailCraft iframe wrapper with postMessage handling |
| `components/admin/email/recipient-selector.tsx` | Recipient filter UI (all/course/individual) |

### Frontend — Modified Files

| File | Change |
|---|---|
| `components/admin/admin-shell.tsx` | Add "Email" nav item to admin sidebar |

---

## Chunk 1: Backend Foundation

### Task 1: Django Settings & App Scaffold

**Files:**
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/email_campaigns/__init__.py`
- Create: `backend/apps/email_campaigns/apps.py`

- [ ] **Step 1: Add EmailCraft settings to base.py**

In `backend/config/settings/base.py`, add after the existing `RESEND_FROM_EMAIL` line:

```python
# EmailCraft
EMAILCRAFT_TOKEN = os.environ.get("EMAILCRAFT_TOKEN", "")
EMAILCRAFT_BASE_URL = os.environ.get("EMAILCRAFT_BASE_URL", "https://emailcraft.contentor.app")
```

- [ ] **Step 2: Add `apps.email_campaigns` to TENANT_APPS**

In `backend/config/settings/base.py`, add `"apps.email_campaigns",` at the end of the `TENANT_APPS` list (after `"apps.billing"`).

- [ ] **Step 3: Create the app scaffold**

Create `backend/apps/email_campaigns/__init__.py` (empty file).

Create `backend/apps/email_campaigns/apps.py`:
```python
from django.apps import AppConfig


class EmailCampaignsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.email_campaigns"
    label = "email_campaigns"
```

- [ ] **Step 4: Verify app loads**

Run: `cd /Users/tahayusufkomur/ws/workdir-contentor-customerapp/contentor && make dev` (or equivalent Django check)
Expected: No import errors

- [ ] **Step 5: Commit**

```
feat(email): scaffold email_campaigns app with EmailCraft settings
```

---

### Task 2: TenantConfig Field — emailcraft_api_key

**Files:**
- Modify: `backend/apps/tenant_config/models.py`
- Verify: `backend/apps/tenant_config/serializers.py` (no change needed — uses explicit `fields` list)

- [ ] **Step 1: Add field to TenantConfig model**

In `backend/apps/tenant_config/models.py`, add after the `onboarding_completed` field:

```python
    emailcraft_api_key = models.CharField(max_length=255, blank=True, default="")
```

- [ ] **Step 2: Verify serializer excludes the field**

Read `backend/apps/tenant_config/serializers.py` and confirm the `Meta.fields` list does NOT include `emailcraft_api_key`. Since it uses an explicit `fields = [...]` list (not `"__all__"`), the new field will NOT be exposed. No change needed.

- [ ] **Step 3: Create and run migration**

Run: `python manage.py makemigrations tenant_config`
Run: `python manage.py migrate_schemas --shared` (if needed) or let it apply on next full migrate.

- [ ] **Step 4: Commit**

```
feat(email): add emailcraft_api_key to TenantConfig
```

---

### Task 3: EmailCampaign Model

**Files:**
- Create: `backend/apps/email_campaigns/models.py`
- Create: `backend/apps/email_campaigns/admin.py`

- [ ] **Step 1: Create EmailCampaign model**

Create `backend/apps/email_campaigns/models.py`:

```python
from django.conf import settings
from django.db import models


class CampaignStatus(models.TextChoices):
    SENDING = "sending", "Sending"
    SENT = "sent", "Sent"
    PARTIAL = "partial", "Partial"
    FAILED = "failed", "Failed"


class EmailCampaign(models.Model):
    subject = models.CharField(max_length=255)
    template_id = models.CharField(max_length=255)
    template_name = models.CharField(max_length=255, blank=True, default="")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
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
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "email_campaigns"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject} ({self.status})"
```

- [ ] **Step 2: Create admin registration**

Create `backend/apps/email_campaigns/admin.py`:

```python
from django.contrib import admin

from .models import EmailCampaign


@admin.register(EmailCampaign)
class EmailCampaignAdmin(admin.ModelAdmin):
    list_display = ("subject", "sender", "status", "recipient_count", "success_count", "failure_count", "created_at")
    list_filter = ("status",)
    readonly_fields = ("created_at", "sent_at")
```

- [ ] **Step 3: Create and run migration**

Run: `python manage.py makemigrations email_campaigns`
Run: `python manage.py migrate_schemas`

- [ ] **Step 4: Commit**

```
feat(email): add EmailCampaign model
```

---

### Task 4: EmailCraft API Client

**Files:**
- Create: `backend/apps/email_campaigns/emailcraft_client.py`

This is a standalone module that wraps all EmailCraft HTTP calls. No Django views — pure HTTP client logic.

- [ ] **Step 1: Create the EmailCraft client**

Create `backend/apps/email_campaigns/emailcraft_client.py`:

```python
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

BASE_URL = None


def _base_url():
    global BASE_URL
    if BASE_URL is None:
        BASE_URL = settings.EMAILCRAFT_BASE_URL.rstrip("/")
    return BASE_URL


def _site_headers():
    """Headers for site-level API calls (provisioning)."""
    return {
        "Authorization": f"Token {settings.EMAILCRAFT_TOKEN}",
        "Content-Type": "application/json",
    }


def _org_headers(api_key):
    """Headers for org-level API calls (templates, render, sessions)."""
    return {
        "X-API-Key": api_key,
        "Content-Type": "application/json",
    }


def provision_organization(name):
    """
    Create a new EmailCraft organization.
    Returns {"organization": {...}, "api_key": {"raw": "mc_live_...", ...}}.
    """
    url = f"{_base_url()}/api/v1/site/provision"
    resp = requests.post(url, json={"name": name}, headers=_site_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def create_session(api_key, origin):
    """
    Create a session token for the iframe.
    Returns {"token": "sess_...", "expires_at": "...", "config": {...}}.
    """
    url = f"{_base_url()}/api/v1/auth/session"
    resp = requests.post(url, json={"origin": origin}, headers=_org_headers(api_key), timeout=15)
    resp.raise_for_status()
    return resp.json()


def list_templates(api_key):
    """List all templates for the organization."""
    url = f"{_base_url()}/api/v1/templates"
    resp = requests.get(url, headers=_org_headers(api_key), timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_template(api_key, template_id):
    """Get a single template with full JSON data."""
    url = f"{_base_url()}/api/v1/templates/{template_id}"
    resp = requests.get(url, headers=_org_headers(api_key), timeout=15)
    resp.raise_for_status()
    return resp.json()


def delete_template(api_key, template_id):
    """Delete a template."""
    url = f"{_base_url()}/api/v1/templates/{template_id}"
    resp = requests.delete(url, headers=_org_headers(api_key), timeout=15)
    resp.raise_for_status()


def list_gallery(api_key, category=None):
    """List gallery templates."""
    url = f"{_base_url()}/api/v1/gallery"
    params = {}
    if category:
        params["category"] = category
    resp = requests.get(url, headers=_org_headers(api_key), params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def configure_variables(api_key, variables):
    """
    Configure available template variables for the organization.
    variables: list of dicts with {key, label, defaultValue?}
    """
    url = f"{_base_url()}/api/v1/templates/variables"
    resp = requests.put(url, json={"variables": variables}, headers=_org_headers(api_key), timeout=15)
    resp.raise_for_status()
    return resp.json()


DEFAULT_VARIABLES = [
    {"key": "student_name", "label": "Student Name", "defaultValue": "Student"},
    {"key": "student_email", "label": "Student Email", "defaultValue": ""},
    {"key": "course_name", "label": "Course Name", "defaultValue": ""},
    {"key": "coach_name", "label": "Coach Name", "defaultValue": ""},
    {"key": "brand_name", "label": "Brand Name", "defaultValue": ""},
]


def render_template(api_key, template_id, variables):
    """
    Render a template with variables. Returns rendered HTML.
    Raises on missing variables (400).
    """
    url = f"{_base_url()}/api/v1/render"
    payload = {"template_id": template_id, "variables": variables}
    resp = requests.post(url, json=payload, headers=_org_headers(api_key), timeout=30)
    resp.raise_for_status()
    return resp.json()
```

- [ ] **Step 2: Commit**

```
feat(email): add EmailCraft API client
```

---

### Task 5: Extend send_email with from_name Support

**Files:**
- Modify: `backend/apps/core/email.py`

- [ ] **Step 1: Update send_email signature**

In `backend/apps/core/email.py`, change the `send_email` function to accept an optional `from_name` parameter:

```python
def send_email(to: str, subject: str, html: str, from_name: str = "") -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set, logging email instead")
        logger.info("Email to=%s subject=%s", to, subject)
        return False

    resend.api_key = settings.RESEND_API_KEY

    from_email = settings.RESEND_FROM_EMAIL
    if from_name:
        from_email = f"{from_name} <{settings.RESEND_FROM_EMAIL}>"

    try:
        resend.Emails.send(
            {
                "from": from_email,
                "to": [to],
                "subject": subject,
                "html": html,
            }
        )
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False
```

- [ ] **Step 2: Verify existing callers are unaffected**

The existing `send_magic_link` function calls `send_email(to, subject, html)` without `from_name` — the default empty string means no change in behavior.

- [ ] **Step 3: Commit**

```
feat(email): extend send_email with optional from_name
```

---

### Task 6: Recipient Resolution Logic

**Files:**
- Create: `backend/apps/email_campaigns/recipients.py`

- [ ] **Step 1: Create recipient resolver**

Create `backend/apps/email_campaigns/recipients.py`:

```python
from apps.accounts.models import User
from apps.courses.models import Enrollment


def resolve_recipients(recipient_filter):
    """
    Resolve a recipient_filter JSON into a queryset of User objects.

    Supported filter types:
    - {"type": "all"} → all active students
    - {"type": "course", "course_ids": [1, 2]} → students enrolled in any of these courses
    - {"type": "individual", "user_ids": [1, 5, 12]} → specific students by PK

    Returns a User queryset (deduplicated).
    """
    filter_type = recipient_filter.get("type")

    if filter_type == "all":
        return User.objects.filter(role="student", is_active=True)

    if filter_type == "course":
        course_ids = recipient_filter.get("course_ids", [])
        user_ids = (
            Enrollment.objects.filter(course_id__in=course_ids, is_active=True)
            .values_list("user_id", flat=True)
            .distinct()
        )
        return User.objects.filter(pk__in=user_ids, role="student", is_active=True)

    if filter_type == "individual":
        user_ids = recipient_filter.get("user_ids", [])
        return User.objects.filter(pk__in=user_ids, role="student", is_active=True)

    return User.objects.none()


def get_recipient_count(recipient_filter):
    """Return the count of recipients without loading them."""
    return resolve_recipients(recipient_filter).count()
```

- [ ] **Step 2: Commit**

```
feat(email): add recipient resolution logic
```

---

## Chunk 2: Backend API Endpoints

### Task 7: Campaign Serializers

**Files:**
- Create: `backend/apps/email_campaigns/serializers.py`

- [ ] **Step 1: Create serializers**

Create `backend/apps/email_campaigns/serializers.py`:

```python
from rest_framework import serializers

from .models import EmailCampaign
from .recipients import get_recipient_count


class SendEmailSerializer(serializers.Serializer):
    template_id = serializers.CharField()
    template_name = serializers.CharField(required=False, default="")
    subject = serializers.CharField(max_length=255)
    recipient_filter = serializers.JSONField()

    def validate_recipient_filter(self, value):
        filter_type = value.get("type")
        if filter_type not in ("all", "course", "individual"):
            raise serializers.ValidationError("Invalid filter type. Must be 'all', 'course', or 'individual'.")

        if filter_type == "course":
            course_ids = value.get("course_ids")
            if not course_ids or not isinstance(course_ids, list):
                raise serializers.ValidationError("course_ids must be a non-empty list.")

        if filter_type == "individual":
            user_ids = value.get("user_ids")
            if not user_ids or not isinstance(user_ids, list):
                raise serializers.ValidationError("user_ids must be a non-empty list.")

        count = get_recipient_count(value)
        if count == 0:
            raise serializers.ValidationError("No recipients match the filter.")

        return value


class EmailCampaignSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True)
    sender_email = serializers.CharField(source="sender.email", read_only=True)

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
            "created_at",
            "sent_at",
        ]
        read_only_fields = fields
```

- [ ] **Step 2: Commit**

```
feat(email): add campaign serializers
```

---

### Task 8: API Views — Session, Templates, Send & Campaigns

**Files:**
- Create: `backend/apps/email_campaigns/views.py`
- Create: `backend/apps/email_campaigns/tasks.py` (empty stub — full implementation in Task 9)

- [ ] **Step 1: Create empty tasks.py stub** (needed so views.py can import from it)

Create `backend/apps/email_campaigns/tasks.py`:
```python
# Stub — full implementation in Task 9
```

- [ ] **Step 2: Create views for session, template proxy, send, and campaigns**

Create `backend/apps/email_campaigns/views.py`:

```python
import logging

from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.tenant_config.models import TenantConfig

from . import emailcraft_client
from .models import CampaignStatus, EmailCampaign
from .recipients import get_recipient_count
from .serializers import EmailCampaignSerializer, SendEmailSerializer

logger = logging.getLogger(__name__)


def _get_api_key():
    """Get the tenant's EmailCraft API key, provisioning if needed."""
    config = TenantConfig.objects.first()
    if not config:
        return None, "Tenant config not found."

    if config.emailcraft_api_key:
        return config.emailcraft_api_key, None

    # Lazy provisioning
    try:
        result = emailcraft_client.provision_organization(config.brand_name)
        api_key = result["api_key"]["raw"]
        config.emailcraft_api_key = api_key
        config.save(update_fields=["emailcraft_api_key"])

        # Configure default template variables
        try:
            emailcraft_client.configure_variables(api_key, emailcraft_client.DEFAULT_VARIABLES)
        except Exception:
            logger.warning("Failed to configure EmailCraft variables (non-blocking)")

        return api_key, None
    except Exception:
        logger.exception("Failed to provision EmailCraft org for tenant %s", connection.tenant.schema_name)
        return None, "Failed to provision email service."


def _get_tenant_origin():
    """Get the tenant's origin URL for session token scoping."""
    from django.conf import settings as django_settings

    from apps.core.models import Domain

    tenant = connection.tenant
    domain = Domain.objects.filter(tenant=tenant, is_primary=True).first()
    if domain:
        return f"https://{domain.domain}"
    return f"https://{tenant.subdomain}.{django_settings.CONTENTOR_DOMAIN}"


# ─── Session ───

@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def create_session(request):
    """Create an EmailCraft session token for the iframe."""
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        origin = _get_tenant_origin()
        result = emailcraft_client.create_session(api_key, origin)
        return Response({
            "session_token": result["token"],
            "expires_at": result["expires_at"],
        })
    except Exception:
        logger.exception("Failed to create EmailCraft session")
        return Response(
            {"detail": "Email builder temporarily unavailable."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


# ─── Templates (proxy) ───

@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def template_list(request):
    """List tenant's templates from EmailCraft."""
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        data = emailcraft_client.list_templates(api_key)
        return Response(data)
    except Exception:
        logger.exception("Failed to list templates")
        return Response({"detail": "Failed to load templates."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET", "DELETE"])
@permission_classes([IsCoachOrOwner])
def template_detail(request, template_id):
    """Get or delete a single template."""
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        if request.method == "GET":
            data = emailcraft_client.get_template(api_key, template_id)
            return Response(data)
        else:
            emailcraft_client.delete_template(api_key, template_id)
            return Response(status=status.HTTP_204_NO_CONTENT)
    except Exception:
        logger.exception("Failed to access template %s", template_id)
        return Response({"detail": "Failed to access template."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def gallery_list(request):
    """List EmailCraft gallery templates."""
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        category = request.query_params.get("category")
        data = emailcraft_client.list_gallery(api_key, category=category)
        return Response(data)
    except Exception:
        logger.exception("Failed to list gallery templates")
        return Response({"detail": "Failed to load gallery."}, status=status.HTTP_502_BAD_GATEWAY)


# ─── Send ───

@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def send_campaign(request):
    """Create a campaign and dispatch the send task."""
    serializer = SendEmailSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data

    # Check quota
    from apps.core.models import Tenant, TenantUsage
    from django.utils import timezone

    tenant = connection.tenant
    today = timezone.now().date()
    month_start = today.replace(day=1)

    usage, _ = TenantUsage.objects.using("default").get_or_create(
        tenant=tenant,
        month=month_start,
    )
    recipient_count = get_recipient_count(data["recipient_filter"])

    if tenant.plan and tenant.plan.max_campaign_emails:
        if usage.emails_sent + recipient_count > tenant.plan.max_campaign_emails:
            return Response(
                {"detail": "Email quota exceeded for this month."},
                status=status.HTTP_403_FORBIDDEN,
            )

    # Idempotency: reject if same sender already has a "sending" campaign with same template+subject
    existing = EmailCampaign.objects.filter(
        sender=request.user,
        template_id=data["template_id"],
        subject=data["subject"],
        status=CampaignStatus.SENDING,
    ).exists()
    if existing:
        return Response(
            {"detail": "A campaign with this template and subject is already being sent."},
            status=status.HTTP_409_CONFLICT,
        )

    # Create campaign record synchronously
    campaign = EmailCampaign.objects.create(
        subject=data["subject"],
        template_id=data["template_id"],
        template_name=data.get("template_name", ""),
        sender=request.user,
        recipient_filter=data["recipient_filter"],
        recipient_count=recipient_count,
        status=CampaignStatus.SENDING,
    )

    # Dispatch Celery task
    from .tasks import send_campaign_emails

    send_campaign_emails.delay(campaign.id, connection.tenant.schema_name)

    return Response(
        EmailCampaignSerializer(campaign).data,
        status=status.HTTP_201_CREATED,
    )


# ─── Campaign Log ───

@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def campaign_list(request):
    """List past campaigns, newest first."""
    campaigns = EmailCampaign.objects.select_related("sender").all()

    # Simple pagination
    limit = int(request.query_params.get("limit", 20))
    offset = int(request.query_params.get("offset", 0))
    total = campaigns.count()
    page = campaigns[offset : offset + limit]

    return Response({
        "count": total,
        "results": EmailCampaignSerializer(page, many=True).data,
    })


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def campaign_detail(request, pk):
    """Get campaign detail."""
    try:
        campaign = EmailCampaign.objects.select_related("sender").get(pk=pk)
    except EmailCampaign.DoesNotExist:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(EmailCampaignSerializer(campaign).data)
```

- [ ] **Step 3: Commit**

```
feat(email): add API views for session, templates, send, campaigns
```

---

### Task 9: Celery Send Task

**Files:**
- Modify: `backend/apps/email_campaigns/tasks.py` (replace stub from Task 8)

- [ ] **Step 1: Implement the Celery task**

Replace the stub in `backend/apps/email_campaigns/tasks.py` with:

```python
import logging

from celery import shared_task
from django.db.models import F
from django.utils import timezone
from django_tenants.utils import tenant_context

from apps.core.email import send_email

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def send_campaign_emails(self, campaign_id, schema_name):
    """
    Render and send emails for a campaign.
    Runs inside tenant_context for recipient queries,
    then updates TenantUsage in public schema.
    """
    from apps.core.models import Tenant, TenantUsage

    tenant = Tenant.objects.get(schema_name=schema_name)
    success = 0

    try:
        with tenant_context(tenant):
            from apps.email_campaigns import emailcraft_client
            from apps.email_campaigns.models import CampaignStatus, EmailCampaign
            from apps.email_campaigns.recipients import resolve_recipients
            from apps.tenant_config.models import TenantConfig

            try:
                campaign = EmailCampaign.objects.get(pk=campaign_id)
            except EmailCampaign.DoesNotExist:
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
            coach_name = campaign.sender.name or campaign.sender.email
            from_name = f"{coach_name} via {brand_name}"

            # Resolve recipients
            recipients = list(resolve_recipients(campaign.recipient_filter).values("id", "name", "email"))
            campaign.recipient_count = len(recipients)

            # Determine course_name for single-course filters
            course_name = ""
            rf = campaign.recipient_filter
            if rf.get("type") == "course":
                course_ids = rf.get("course_ids", [])
                if len(course_ids) == 1:
                    from apps.courses.models import Course

                    course = Course.objects.filter(pk=course_ids[0]).first()
                    if course:
                        course_name = course.title

            # Mid-batch quota check
            today = timezone.now().date()
            month_start = today.replace(day=1)

        # Check quota in public schema
        usage, _ = TenantUsage.objects.get_or_create(tenant=tenant, month=month_start)
        remaining_quota = None
        if tenant.plan and tenant.plan.max_campaign_emails:
            remaining_quota = tenant.plan.max_campaign_emails - usage.emails_sent

        with tenant_context(tenant):
            failure = 0

            for recipient in recipients:
                # Check quota mid-batch
                if remaining_quota is not None and success >= remaining_quota:
                    logger.warning("Quota reached mid-batch for campaign %s", campaign_id)
                    break

                try:
                    variables = {
                        "student_name": recipient["name"] or recipient["email"],
                        "student_email": recipient["email"],
                        "course_name": course_name,
                        "coach_name": coach_name,
                        "brand_name": brand_name,
                    }
                    rendered = emailcraft_client.render_template(api_key, campaign.template_id, variables)
                    html = rendered.get("html", "")

                    sent = send_email(
                        to=recipient["email"],
                        subject=campaign.subject,
                        html=html,
                        from_name=from_name,
                    )
                    if sent:
                        success += 1
                    else:
                        failure += 1
                except Exception:
                    logger.exception("Failed to send to %s for campaign %s", recipient["email"], campaign_id)
                    failure += 1

            # Update campaign
            campaign.success_count = success
            campaign.failure_count = failure
            campaign.sent_at = timezone.now()

            if success == 0:
                campaign.status = CampaignStatus.FAILED
            elif failure == 0:
                campaign.status = CampaignStatus.SENT
            else:
                campaign.status = CampaignStatus.PARTIAL

            campaign.save(update_fields=[
                "recipient_count", "success_count", "failure_count", "status", "sent_at",
            ])

        # Update usage in public schema
        if success > 0:
            TenantUsage.objects.filter(tenant=tenant, month=month_start).update(
                emails_sent=F("emails_sent") + success
            )

        logger.info(
            "Campaign %s complete: %d sent, %d failed",
            campaign_id, success, failure,
        )

    except Exception:
        logger.exception("Unexpected error in campaign %s", campaign_id)
        # Mark campaign as failed to prevent deadlock on idempotency check
        with tenant_context(tenant):
            from apps.email_campaigns.models import CampaignStatus, EmailCampaign

            try:
                campaign = EmailCampaign.objects.get(pk=campaign_id)
                campaign.status = CampaignStatus.FAILED
                campaign.sent_at = timezone.now()
                campaign.save(update_fields=["status", "sent_at"])
            except EmailCampaign.DoesNotExist:
                pass
```

- [ ] **Step 2: Commit**

```
feat(email): add Celery task for campaign send
```

---

### Task 10: URL Routing

**Files:**
- Create: `backend/apps/email_campaigns/urls.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Create URL patterns**

Create `backend/apps/email_campaigns/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("session/", views.create_session, name="email-session"),
    path("templates/", views.template_list, name="email-template-list"),
    path("templates/<str:template_id>/", views.template_detail, name="email-template-detail"),
    path("gallery/", views.gallery_list, name="email-gallery-list"),
    path("send/", views.send_campaign, name="email-send"),
    path("campaigns/", views.campaign_list, name="email-campaign-list"),
    path("campaigns/<int:pk>/", views.campaign_detail, name="email-campaign-detail"),
]
```

- [ ] **Step 2: Register in main urls.py**

In `backend/config/urls.py`, add this line after the existing `path("api/v1/billing/", ...)`:

```python
    path("api/v1/email/", include("apps.email_campaigns.urls")),
```

- [ ] **Step 3: Verify routes load**

Run: `python manage.py show_urls | grep email` (or equivalent check)
Expected: All 7 email endpoints listed

- [ ] **Step 4: Commit**

```
feat(email): register email campaign URL routes
```

---

## Chunk 3: Frontend Implementation

### Task 11: Email API Client

**Files:**
- Create: `frontend-customer/src/lib/email-api.ts`

- [ ] **Step 1: Create the API client**

Create `frontend-customer/src/lib/email-api.ts`:

```typescript
import { clientFetch } from "@/lib/api-client";

// ─── Types ───

export interface EmailSession {
  session_token: string;
  expires_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface GalleryTemplate {
  id: string;
  name: string;
  category: string;
  is_premium: boolean;
  [key: string]: unknown;
}

export interface EmailCampaign {
  id: number;
  subject: string;
  template_id: string;
  template_name: string;
  sender: number;
  sender_name: string;
  sender_email: string;
  recipient_filter: RecipientFilter;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  status: "sending" | "sent" | "partial" | "failed";
  created_at: string;
  sent_at: string | null;
}

export type RecipientFilter =
  | { type: "all" }
  | { type: "course"; course_ids: number[] }
  | { type: "individual"; user_ids: number[] };

export interface PaginatedResponse<T> {
  count: number;
  results: T[];
}

// ─── API Functions ───

export async function createEmailSession(): Promise<EmailSession> {
  return clientFetch<EmailSession>("/api/v1/email/session/", {
    method: "POST",
  });
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  return clientFetch<EmailTemplate[]>("/api/v1/email/templates/");
}

export async function getTemplate(id: string): Promise<EmailTemplate> {
  return clientFetch<EmailTemplate>(`/api/v1/email/templates/${id}/`);
}

export async function deleteTemplate(id: string): Promise<void> {
  return clientFetch<void>(`/api/v1/email/templates/${id}/`, {
    method: "DELETE",
  });
}

export async function listGallery(
  category?: string
): Promise<GalleryTemplate[]> {
  const params = category ? `?category=${category}` : "";
  return clientFetch<GalleryTemplate[]>(`/api/v1/email/gallery/${params}`);
}

export async function sendCampaign(data: {
  template_id: string;
  template_name?: string;
  subject: string;
  recipient_filter: RecipientFilter;
}): Promise<EmailCampaign> {
  return clientFetch<EmailCampaign>("/api/v1/email/send/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listCampaigns(
  limit = 20,
  offset = 0
): Promise<PaginatedResponse<EmailCampaign>> {
  return clientFetch<PaginatedResponse<EmailCampaign>>(
    `/api/v1/email/campaigns/?limit=${limit}&offset=${offset}`
  );
}

export async function getCampaign(id: number): Promise<EmailCampaign> {
  return clientFetch<EmailCampaign>(`/api/v1/email/campaigns/${id}/`);
}
```

- [ ] **Step 2: Commit**

```
feat(email): add frontend email API client
```

---

### Task 12: EmailCraft Iframe Component

**Files:**
- Create: `frontend-customer/src/components/admin/email/email-builder-iframe.tsx`

- [ ] **Step 1: Create the iframe wrapper component**

Create `frontend-customer/src/components/admin/email/email-builder-iframe.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createEmailSession } from "@/lib/email-api";

const EMAILCRAFT_BASE = process.env.NEXT_PUBLIC_EMAILCRAFT_URL || "https://emailcraft.contentor.app";

interface SavePayload {
  html: string;
  json: Record<string, unknown>;
}

interface EmailBuilderIframeProps {
  templateJson?: Record<string, unknown>;
  onSave?: (payload: SavePayload) => void;
  onReady?: () => void;
}

export function EmailBuilderIframe({
  templateJson,
  onSave,
  onReady,
}: EmailBuilderIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderReady, setBuilderReady] = useState(false);

  // Fetch session token
  useEffect(() => {
    let cancelled = false;
    createEmailSession()
      .then((session) => {
        if (!cancelled) setSessionToken(session.session_token);
      })
      .catch(() => {
        if (!cancelled) setError("Email builder temporarily unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for postMessage events from EmailCraft
  useEffect(() => {
    const handle = (e: MessageEvent) => {
      if (e.data?.source !== "mailcraft") return;

      switch (e.data.type) {
        case "MAILCRAFT_READY":
          setBuilderReady(true);
          onReady?.();
          break;
        case "MAILCRAFT_SAVE":
          onSave?.({
            html: e.data.payload?.html ?? "",
            json: e.data.payload?.json ?? {},
          });
          break;
      }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [onSave, onReady]);

  // Load template into builder once ready
  useEffect(() => {
    if (!builderReady || !templateJson || !iframeRef.current) return;

    iframeRef.current.contentWindow?.postMessage(
      {
        source: "mailcraft-host",
        type: "MAILCRAFT_LOAD_TEMPLATE",
        payload: { json: templateJson },
      },
      EMAILCRAFT_BASE
    );
  }, [builderReady, templateJson]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] border rounded-lg bg-muted/30">
        <p className="text-muted-foreground">Loading email builder...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px] border rounded-lg bg-destructive/5">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!sessionToken) return null;

  return (
    <iframe
      ref={iframeRef}
      src={`${EMAILCRAFT_BASE}/builder/?sessionToken=${sessionToken}`}
      className="w-full border rounded-lg"
      style={{ height: "800px" }}
      allow="clipboard-write"
    />
  );
}
```

- [ ] **Step 2: Commit**

```
feat(email): add EmailCraft iframe wrapper component
```

---

### Task 13: Recipient Selector Component

**Files:**
- Create: `frontend-customer/src/components/admin/email/recipient-selector.tsx`

- [ ] **Step 1: Create the recipient selector**

Create `frontend-customer/src/components/admin/email/recipient-selector.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/api-client";
import type { RecipientFilter } from "@/lib/email-api";

interface Course {
  id: number;
  title: string;
  slug: string;
}

interface Student {
  id: number;
  name: string;
  email: string;
}

interface RecipientSelectorProps {
  value: RecipientFilter;
  onChange: (filter: RecipientFilter) => void;
  recipientCount: number | null;
  onCountChange: (count: number | null) => void;
}

export function RecipientSelector({
  value,
  onChange,
  recipientCount,
  onCountChange,
}: RecipientSelectorProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [loadingCount, setLoadingCount] = useState(false);

  // Load courses and students for selectors
  useEffect(() => {
    clientFetch<{ results: Course[] }>("/api/v1/courses/?limit=100")
      .then((data) => setCourses(data.results || []))
      .catch(() => {});
    clientFetch<{ results: Student[] }>(
      "/api/v1/auth/students/?limit=100"
    )
      .then((data) => setStudents(data.results || []))
      .catch(() => {});
  }, []);

  // Fetch recipient count when filter changes
  useEffect(() => {
    onCountChange(null);
    setLoadingCount(true);

    const timer = setTimeout(() => {
      // Use the backend count endpoint or compute locally
      // For now, compute locally based on available data
      if (value.type === "all") {
        onCountChange(students.length);
      } else if (value.type === "course" && value.course_ids.length > 0) {
        // Approximate — actual count comes from backend at send time
        onCountChange(null); // Will be determined by backend
      } else if (value.type === "individual") {
        onCountChange(value.user_ids.length);
      }
      setLoadingCount(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [value, students.length, onCountChange]);

  const filterType = value.type;

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">Recipients</label>

      {/* Filter type radio */}
      <div className="flex gap-4">
        {(["all", "course", "individual"] as const).map((type) => (
          <label key={type} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="recipient_type"
              checked={filterType === type}
              onChange={() => {
                if (type === "all") onChange({ type: "all" });
                else if (type === "course")
                  onChange({ type: "course", course_ids: [] });
                else onChange({ type: "individual", user_ids: [] });
              }}
              className="accent-primary"
            />
            <span className="text-sm">
              {type === "all"
                ? "All students"
                : type === "course"
                  ? "By course"
                  : "Individual students"}
            </span>
          </label>
        ))}
      </div>

      {/* Course multi-select */}
      {filterType === "course" && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Select courses
          </label>
          <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1">
            {courses.map((course) => {
              const selected =
                value.type === "course" &&
                value.course_ids.includes(course.id);
              return (
                <label
                  key={course.id}
                  className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      if (value.type !== "course") return;
                      const ids = selected
                        ? value.course_ids.filter((id) => id !== course.id)
                        : [...value.course_ids, course.id];
                      onChange({ type: "course", course_ids: ids });
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm">{course.title}</span>
                </label>
              );
            })}
            {courses.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">
                No courses found.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Individual student picker */}
      {filterType === "individual" && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search students..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1">
            {filteredStudents.map((student) => {
              const selected =
                value.type === "individual" &&
                value.user_ids.includes(student.id);
              return (
                <label
                  key={student.id}
                  className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      if (value.type !== "individual") return;
                      const ids = selected
                        ? value.user_ids.filter((id) => id !== student.id)
                        : [...value.user_ids, student.id];
                      onChange({ type: "individual", user_ids: ids });
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm">
                    {student.name || student.email}
                  </span>
                  {student.name && (
                    <span className="text-xs text-muted-foreground">
                      {student.email}
                    </span>
                  )}
                </label>
              );
            })}
            {filteredStudents.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">
                No students found.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recipient count */}
      <div className="text-sm text-muted-foreground">
        {loadingCount
          ? "Counting recipients..."
          : recipientCount !== null
            ? `${recipientCount} recipient${recipientCount !== 1 ? "s" : ""}`
            : filterType === "all"
              ? "All active students"
              : "Select recipients above"}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(email): add recipient selector component
```

---

### Task 14: Campaign Dashboard Page

**Files:**
- Create: `frontend-customer/src/app/admin/email/page.tsx`

- [ ] **Step 1: Create the campaign dashboard page**

Create `frontend-customer/src/app/admin/email/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listCampaigns, type EmailCampaign } from "@/lib/email-api";

const STATUS_STYLES: Record<string, string> = {
  sending: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function EmailDashboardPage() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await listCampaigns();
      setCampaigns(data.results);
      setTotal(data.count);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Send beautiful emails to your students.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/email/templates"
            className="px-4 py-2 text-sm border rounded-md hover:bg-muted/50"
          >
            Templates
          </Link>
          <Link
            href="/admin/email/compose"
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            New Email
          </Link>
        </div>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading campaigns...
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/10">
          <p className="text-muted-foreground">No campaigns sent yet.</p>
          <Link
            href="/admin/email/compose"
            className="inline-block mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            Send your first email
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Subject
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Recipients
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Sent
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-sm font-medium">
                    {c.subject}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[c.status] || ""}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {c.recipient_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {c.success_count}/{c.recipient_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(email): add campaign dashboard page
```

---

### Task 15: Template Library Page

**Files:**
- Create: `frontend-customer/src/app/admin/email/templates/page.tsx`

- [ ] **Step 1: Create the template library page**

Create `frontend-customer/src/app/admin/email/templates/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  listTemplates,
  deleteTemplate,
  listGallery,
  type EmailTemplate,
  type GalleryTemplate,
} from "@/lib/email-api";

export default function TemplateLibraryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [gallery, setGallery] = useState<GalleryTemplate[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await listTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGallery = useCallback(async () => {
    try {
      const data = await listGallery();
      setGallery(Array.isArray(data) ? data : []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (showGallery) fetchGallery();
  }, [showGallery, fetchGallery]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // silently fail
    }
  };

  const handleEdit = (templateId: string) => {
    router.push(`/admin/email/compose?template=${templateId}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your email templates.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGallery(!showGallery)}
            className="px-4 py-2 text-sm border rounded-md hover:bg-muted/50"
          >
            {showGallery ? "My Templates" : "Browse Gallery"}
          </button>
          <Link
            href="/admin/email/compose"
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            New Template
          </Link>
        </div>
      </div>

      {/* Template grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading templates...
        </div>
      ) : showGallery ? (
        /* Gallery view */
        <div>
          <h2 className="text-lg font-semibold mb-4">Gallery Templates</h2>
          {gallery.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No gallery templates available.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {gallery.map((t) => (
                <div
                  key={t.id}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <h3 className="font-medium text-sm">{t.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.category}
                    {t.is_premium && " (Premium)"}
                  </p>
                  <button
                    onClick={() => handleEdit(t.id)}
                    className="mt-3 text-xs text-primary hover:underline"
                  >
                    Use this template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/10">
          <p className="text-muted-foreground">No templates yet.</p>
          <button
            onClick={() => setShowGallery(true)}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Browse the gallery to get started
          </button>
        </div>
      ) : (
        /* My templates */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <h3 className="font-medium text-sm">{t.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(t.updated_at || t.created_at).toLocaleDateString()}
              </p>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => handleEdit(t.id)}
                  className="text-xs text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(email): add template library page
```

---

### Task 16: Compose Page (Design + Send)

**Files:**
- Create: `frontend-customer/src/app/admin/email/compose/page.tsx`

- [ ] **Step 1: Create the compose page**

Create `frontend-customer/src/app/admin/email/compose/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EmailBuilderIframe } from "@/components/admin/email/email-builder-iframe";
import { RecipientSelector } from "@/components/admin/email/recipient-selector";
import {
  getTemplate,
  sendCampaign,
  type RecipientFilter,
} from "@/lib/email-api";

type Step = "design" | "send";

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");

  const [step, setStep] = useState<Step>("design");
  const [templateJson, setTemplateJson] = useState<
    Record<string, unknown> | undefined
  >();
  const [savedTemplateId, setSavedTemplateId] = useState<string>(
    templateId || ""
  );
  const [savedTemplateName, setSavedTemplateName] = useState("");
  const [hasSaved, setHasSaved] = useState(false);

  // Send step state
  const [subject, setSubject] = useState("");
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>({
    type: "all",
  });
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing template JSON if editing
  useEffect(() => {
    if (!templateId) return;
    getTemplate(templateId)
      .then((data) => {
        if (data.json_data) {
          setTemplateJson(data.json_data as Record<string, unknown>);
        }
        if (data.name) {
          setSavedTemplateName(String(data.name));
        }
      })
      .catch(() => {});
  }, [templateId]);

  const handleSave = useCallback(
    (payload: { html: string; json: Record<string, unknown> }) => {
      setHasSaved(true);
      // The template is saved on EmailCraft's side.
      // We capture the template ID from the JSON if available.
      const id =
        (payload.json as { id?: string })?.id || savedTemplateId;
      if (id) setSavedTemplateId(id);
    },
    [savedTemplateId]
  );

  const handleSend = async () => {
    if (!subject.trim()) {
      setError("Please enter a subject line.");
      return;
    }
    if (
      recipientFilter.type === "course" &&
      recipientFilter.course_ids.length === 0
    ) {
      setError("Please select at least one course.");
      return;
    }
    if (
      recipientFilter.type === "individual" &&
      recipientFilter.user_ids.length === 0
    ) {
      setError("Please select at least one student.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      await sendCampaign({
        template_id: savedTemplateId,
        template_name: savedTemplateName,
        subject,
        recipient_filter: recipientFilter,
      });
      router.push("/admin/email");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send campaign.";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {step === "design" ? "Design Email" : "Send Email"}
        </h1>
        {step === "send" && (
          <button
            onClick={() => setStep("design")}
            className="text-sm text-muted-foreground hover:underline"
          >
            Back to editor
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex gap-4 text-sm">
        <span
          className={
            step === "design" ? "font-bold text-primary" : "text-muted-foreground"
          }
        >
          1. Design
        </span>
        <span className="text-muted-foreground">/</span>
        <span
          className={
            step === "send" ? "font-bold text-primary" : "text-muted-foreground"
          }
        >
          2. Send
        </span>
      </div>

      {/* Design step */}
      {step === "design" && (
        <div className="space-y-4">
          <EmailBuilderIframe
            templateJson={templateJson}
            onSave={handleSave}
          />
          <div className="flex justify-end">
            <button
              onClick={() => setStep("send")}
              disabled={!hasSaved && !templateId}
              className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next: Send
            </button>
          </div>
          {!hasSaved && !templateId && (
            <p className="text-xs text-muted-foreground text-right">
              Save your template in the editor first, then click Next.
            </p>
          )}
        </div>
      )}

      {/* Send step */}
      {step === "send" && (
        <div className="max-w-xl space-y-6">
          {/* Subject */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Welcome to our new course!"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          {/* Recipients */}
          <RecipientSelector
            value={recipientFilter}
            onChange={setRecipientFilter}
            recipientCount={recipientCount}
            onCountChange={setRecipientCount}
          />

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
              {error}
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full px-6 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send Campaign"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(email): add compose page with design and send steps
```

---

### Task 17: Admin Navigation Update

**Files:**
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx`

- [ ] **Step 1: Read admin-shell.tsx and find the navigation items**

Read the file and locate the array of navigation items (sidebar links).

- [ ] **Step 2: Add Email nav item**

Add an "Email" entry to the navigation items array, pointing to `/admin/email`. Place it after the existing items (e.g., after "Downloads" or "Settings"). Use a mail icon if the project uses an icon library (lucide-react), otherwise use the same pattern as other nav items.

Example entry (adapt to match existing pattern):
```typescript
{ label: "Email", href: "/admin/email", icon: Mail },
```

- [ ] **Step 3: Verify the navigation renders**

Run the frontend dev server and confirm the "Email" link appears in the admin sidebar.

- [ ] **Step 4: Commit**

```
feat(email): add Email to admin navigation
```

---

## Chunk 4: Integration Verification

### Task 18: End-to-End Verification

- [ ] **Step 1: Run backend migrations**

```bash
cd /Users/tahayusufkomur/ws/workdir-contentor-customerapp/contentor
python manage.py makemigrations
python manage.py migrate_schemas
```

- [ ] **Step 2: Run backend dev server**

```bash
make dev
```
or equivalent. Verify no import errors.

- [ ] **Step 3: Test API endpoints via curl**

Test the session endpoint (should return 503 or session token depending on EmailCraft connectivity):
```bash
curl -X POST http://localhost:8000/api/v1/email/session/ \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json"
```

Test campaigns list:
```bash
curl http://localhost:8000/api/v1/email/campaigns/ \
  -H "Authorization: Bearer <your_token>"
```

- [ ] **Step 4: Run frontend dev server and verify pages**

Navigate to:
- `/admin/email` — campaign dashboard should load
- `/admin/email/templates` — template library should load
- `/admin/email/compose` — compose page with iframe should load

- [ ] **Step 5: Run build**

```bash
cd frontend-customer && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Final commit**

```
chore(email): verify email campaigns integration
```
