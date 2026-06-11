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
    path("plans/<int:pk>/", views_platform.platform_plan_detail, name="platform-plan-detail"),
    path("subscriptions/", views_platform.platform_subscriptions, name="platform-subscriptions"),
    path("webhook-events/", views_platform.platform_webhook_events, name="platform-webhook-events"),
    path(
        "webhook-events/<int:pk>/",
        views_platform.platform_webhook_event_detail,
        name="platform-webhook-event-detail",
    ),
]
