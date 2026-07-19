from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import login
from django.http import HttpResponseRedirect
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.accounts.backends import AdminJWTBackend
from apps.billing.views.webhooks import stripe_webhook
from apps.core.views import health_check


def admin_auto_login(request):
    """Auto-login to Django admin if user has a valid JWT cookie."""
    if request.user.is_authenticated and request.user.is_staff:
        return HttpResponseRedirect("/django-admin/")
    backend = AdminJWTBackend()
    user = backend.authenticate(request)
    if user:
        login(request, user, backend="apps.accounts.backends.AdminJWTBackend")
        return HttpResponseRedirect("/django-admin/")
    return HttpResponseRedirect("/django-admin/login/")


urlpatterns = [
    # Django admin lives at /django-admin/ — apex /admin/* is the superadmin
    # SPA (frontend-main), which the edge proxies route to Next.js.
    path("django-admin/login/", admin_auto_login, name="admin-auto-login"),
    path("django-admin/", admin.site.urls),
    # Provider webhooks. MUST be declared before any `/api/v1/` route so they
    # share the global URL resolver but bypass `TenantJWTAuthentication`.
    # The webhook view sets `@authentication_classes([])` so DRF defaults do
    # not run on it; region + tenant middleware skip `/api/webhooks/*`.
    path("api/webhooks/stripe/", stripe_webhook, name="stripe-webhook"),
    path("api/health/", health_check, name="health-check"),
    path(
        "api/schema/",
        SpectacularAPIView.as_view(authentication_classes=[], permission_classes=[]),
        name="api-schema",
    ),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/demo/", include("apps.core.demo.urls")),
    path("api/v1/onboarding/", include("apps.core.onboarding.urls")),
    path("api/v1/contact/", include("apps.core.contact.urls")),
    path("api/v1/help/", include("apps.core.help.urls")),
    path("api/v1/ai/", include("apps.core.assistant_urls")),
    path("api/v1/assistant/", include("apps.tenant_config.urls_assistant")),
    path("api/v1/preview/", include("apps.core.preview.urls")),
    path("api/v1/admin/", include("apps.tenant_config.urls")),
    path("api/v1/admin/", include("apps.notifications.admin_urls")),
    path("api/v1/admin/", include("apps.usage.admin_urls")),
    path("api/v1/blog/", include("apps.blog.urls")),
    path("api/v1/admin/blog/", include("apps.blog.admin_urls")),
    # Platform email/blog live under their own /platform/ sub-prefixes —
    # declare before the broader /platform/ include so those routes resolve
    # first.
    path("api/v1/platform/email/", include("apps.platform_email.urls")),
    path("api/v1/platform/blog/", include("apps.blog.urls_platform")),
    # Log pipeline + viewer endpoints — declared before the broader
    # /platform/ include so logs/activity resolve here.
    path("api/v1/platform/", include("apps.logbook.urls_platform")),
    path("api/v1/platform/", include("apps.core.platform.urls")),
    path("api/v1/logos/", include("apps.core.curated_logos.urls")),
    path("api/v1/curated-photos/", include("apps.core.curated_photos.urls")),
    # Schema-driven admin kit: superadmin (public schema) + coach studio
    # (tenant schema) sites. See apps/adminkit/.
    path("api/v1/platform-admin/", include("apps.adminkit.urls_platform")),
    path("api/v1/studio-admin/", include("apps.adminkit.urls_studio")),
    path("api/v1/me/", include("apps.core.me.urls")),
    path("api/v1/upload/", include("apps.core.uploads.urls")),
    path("api/v1/courses/", include("apps.courses.urls")),
    path("api/v1/community/", include("apps.community.urls")),
    path("api/v1/filters/", include("apps.filters.urls")),
    path("api/v1/tags/", include("apps.tags.urls")),
    path("api/v1/downloads/", include("apps.downloads.urls")),
    path("api/v1/live/", include("apps.live.urls")),
    path("api/v1/live-streams/", include(("apps.live.urls_streams", "live_streams"))),
    path("api/v1/zoom-classes/", include("apps.live.urls_zoom")),
    path("api/v1/onsite-events/", include("apps.live.urls_onsite")),
    path("api/v1/calendar/", include("apps.live.urls_calendar")),
    path("api/v1/photos/", include("apps.media.urls")),
    path("api/v1/billing/", include("apps.billing.urls")),
    path("api/v1/domains/", include("apps.domains.urls")),
    path("api/v1/email/", include("apps.email_campaigns.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/mailbox/", include("apps.mailbox.urls")),
    path("api/v1/platform/mailbox/", include("apps.mailbox.urls_platform")),
    path("api/v1/platform/community/", include("apps.community.urls_platform")),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# Dev-only surface — never mounted when the sink is off (prod refuses the flag).
if settings.EMAIL_SINK_ENABLED:
    urlpatterns += [path("api/v1/dev/", include("apps.core.dev.urls"))]
