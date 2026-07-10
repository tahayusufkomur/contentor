from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/", views.platform_dashboard, name="platform-dashboard"),
    path("usage/", views.platform_usage, name="platform-usage"),
    path("ai-usage/", views.platform_ai_usage, name="platform-ai-usage"),
    path("tenants/", views.platform_tenants, name="platform-tenants"),
    path(
        "tenants/<slug:slug>/",
        views.platform_tenant_detail,
        name="platform-tenant-detail",
    ),
    path("plans/", views.platform_plans, name="platform-plans"),
    path("plans/<int:pk>/", views.platform_plan_detail, name="platform-plan-detail"),
    path("subscriptions/", views.platform_subscriptions, name="platform-subscriptions"),
    path("webhook-events/", views.platform_webhook_events, name="platform-webhook-events"),
    path(
        "webhook-events/<int:pk>/",
        views.platform_webhook_event_detail,
        name="platform-webhook-event-detail",
    ),
]
