from django.urls import path

from .views import TenantConfigView, admin_stats, setup_status

urlpatterns = [
    path("config/", TenantConfigView.as_view(), name="tenant-config"),
    path("stats/", admin_stats, name="admin-stats"),
    path("setup-status/", setup_status, name="setup-status"),
]
