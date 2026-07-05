from django.urls import path

from .demo_content import demo_content, erase_demo_content
from .views import TenantConfigView, admin_stats, setup_status

urlpatterns = [
    path("config/", TenantConfigView.as_view(), name="tenant-config"),
    path("stats/", admin_stats, name="admin-stats"),
    path("setup-status/", setup_status, name="setup-status"),
    path("demo-content/", demo_content, name="demo-content"),
    path("demo-content/erase/", erase_demo_content, name="demo-content-erase"),
]
