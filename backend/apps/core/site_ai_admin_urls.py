from django.urls import path

from .site_ai_admin import site_ai_apply, site_ai_preview, site_ai_status

urlpatterns = [
    path("status/", site_ai_status, name="site-ai-status"),
    path("preview/", site_ai_preview, name="site-ai-preview"),
    path("apply/", site_ai_apply, name="site-ai-apply"),
]
