from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import login
from django.http import HttpResponseRedirect
from django.urls import include, path

from apps.accounts.backends import AdminJWTBackend
from apps.core.views import health_check


def admin_auto_login(request):
    """Auto-login to Django admin if user has a valid JWT cookie."""
    if request.user.is_authenticated and request.user.is_staff:
        return HttpResponseRedirect("/admin/")
    backend = AdminJWTBackend()
    user = backend.authenticate(request)
    if user:
        login(request, user, backend="apps.accounts.backends.AdminJWTBackend")
        return HttpResponseRedirect("/admin/")
    return HttpResponseRedirect("/admin/login/")


urlpatterns = [
    path("admin/login/", admin_auto_login, name="admin-auto-login"),
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/demo/", include("apps.core.urls_demo")),
    path("api/v1/onboarding/", include("apps.core.urls_onboarding")),
    path("api/v1/admin/", include("apps.tenant_config.urls")),
    path("api/v1/platform/", include("apps.core.urls_platform")),
    path("api/v1/upload/", include("apps.core.urls_upload")),
    path("api/v1/courses/", include("apps.courses.urls")),
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
