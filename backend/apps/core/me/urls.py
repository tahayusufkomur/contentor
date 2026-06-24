from django.urls import path

from apps.domains import views as domain_views
from apps.usage import views as usage_views

from . import views

urlpatterns = [
    path("tenants/", views.my_tenants, name="me-tenants"),
    # Custom-domain wizard (apex/public schema; tenant resolved by slug + owner).
    # More specific than the bare tenant-update route below, so list them first.
    path("tenants/<slug:slug>/domain/search/", domain_views.account_search, name="me-domain-search"),
    path("tenants/<slug:slug>/domain/checkout/", domain_views.account_checkout, name="me-domain-checkout"),
    path("tenants/<slug:slug>/domain/", domain_views.account_current, name="me-domain-current"),
    path("tenants/<slug:slug>/domain/<int:pk>/retry/", domain_views.account_retry, name="me-domain-retry"),
    path("tenants/<slug:slug>/domain/<int:pk>/", domain_views.account_destroy, name="me-domain-destroy"),
    path("tenants/<slug:slug>/", views.update_my_tenant, name="me-tenant-update"),
    path("usage/", usage_views.record_usage, name="me-usage"),
]
