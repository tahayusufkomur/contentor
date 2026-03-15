from django.urls import path

from . import views_platform

urlpatterns = [
    path("dashboard/", views_platform.platform_dashboard, name="platform-dashboard"),
    path("tenants/", views_platform.platform_tenants, name="platform-tenants"),
    path(
        "tenants/<slug:slug>/",
        views_platform.platform_tenant_detail,
        name="platform-tenant-detail",
    ),
    path("plans/", views_platform.platform_plans, name="platform-plans"),
]
