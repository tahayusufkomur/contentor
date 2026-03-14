from django.contrib import admin
from django.urls import include, path

from apps.core.views import health_check

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/onboarding/", include("apps.core.urls_onboarding")),
    path("api/v1/admin/", include("apps.tenant_config.urls")),
]
