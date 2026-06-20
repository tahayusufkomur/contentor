from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import login
from django.http import HttpResponseRedirect
from django.urls import include, path

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
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/demo/", include("apps.core.demo.urls")),
    path("api/v1/onboarding/", include("apps.core.onboarding.urls")),
    path("api/v1/contact/", include("apps.core.contact.urls")),
    path("api/v1/preview/", include("apps.core.preview.urls")),
    path("api/v1/admin/", include("apps.tenant_config.urls")),
    # Platform email lives under /platform/email/ — declare before the broader
    # /platform/ include so its routes resolve first.
    path("api/v1/platform/email/", include("apps.platform_email.urls")),
    path("api/v1/platform/", include("apps.core.platform.urls")),
    # Schema-driven admin kit: superadmin (public schema) + coach studio
    # (tenant schema) sites. See apps/adminkit/.
    path("api/v1/platform-admin/", include("apps.adminkit.urls_platform")),
    path("api/v1/studio-admin/", include("apps.adminkit.urls_studio")),
    path("api/v1/me/", include("apps.core.me.urls")),
    path("api/v1/upload/", include("apps.core.uploads.urls")),
    path("api/v1/courses/", include("apps.courses.urls")),
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
    path("api/v1/email/", include("apps.email_campaigns.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
