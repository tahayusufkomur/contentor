from django.urls import path

from .views import TenantConfigView, admin_stats

urlpatterns = [
    path("config/", TenantConfigView.as_view(), name="tenant-config"),
    path("stats/", admin_stats, name="admin-stats"),
]
