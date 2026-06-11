"""Admin sites: named registries that expose their models as API endpoints.

Two instances exist — `platform_site` (superadmin SPA, public-schema models)
and `studio_site` (coach admin SPA, tenant-schema models). Apps register via
`admin_panels.py` modules:

    from apps.adminkit.options import ModelAdmin, admin_action
    from apps.adminkit.sites import studio_site

    @studio_site.register(SubscriptionPlan)
    class SubscriptionPlanAdmin(ModelAdmin):
        list_display = ("name", "price", "is_active")
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import connection
from django.http import Http404
from django.urls import path
from django_tenants.utils import get_public_schema_name
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes as drf_permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner, IsSuperUser

from .views import build_viewset

if TYPE_CHECKING:
    from .options import ModelAdmin


class AlreadyRegisteredError(Exception):
    pass


class AdminSite:
    def __init__(self, namespace: str, title: str, *, permission_classes: tuple, tenant_only: bool = False):
        self.namespace = namespace
        self.title = title
        self.permission_classes = permission_classes
        self.tenant_only = tenant_only
        self._registry: dict[str, ModelAdmin] = {}

    def register(self, model, admin_class: type[ModelAdmin] | None = None):
        """Register `model`; usable as a decorator on the ModelAdmin subclass."""

        def _register(cls: type[ModelAdmin]) -> type[ModelAdmin]:
            admin = cls(model, self)
            if admin.key in self._registry:
                raise AlreadyRegisteredError(f"{self.namespace}: key '{admin.key}' is already registered")
            self._registry[admin.key] = admin
            return cls

        if admin_class is not None:
            _register(admin_class)
            return admin_class
        return _register

    def get_admin(self, key: str) -> ModelAdmin | None:
        return self._registry.get(key)

    def _visible_models(self, request) -> list[ModelAdmin]:
        visible = []
        for admin in self._registry.values():
            extra = admin.permission_classes
            if extra and not all(p().has_permission(request, None) for p in extra):
                continue
            visible.append(admin)
        return visible

    def _meta_view(self):
        site = self

        @api_view(["GET"])
        @drf_permission_classes(list(site.permission_classes))
        def site_meta(request):
            if site.tenant_only and connection.schema_name == get_public_schema_name():
                raise Http404
            return Response(
                {
                    "namespace": site.namespace,
                    "title": site.title,
                    "models": [
                        {
                            "key": admin.key,
                            "label": admin.label,
                            "label_plural": admin.label_plural,
                            "icon": admin.icon,
                            "description": admin.description,
                            "can_create": admin.can_create,
                        }
                        for admin in site._visible_models(request)
                    ],
                }
            )

        return site_meta

    def get_urls(self):
        urlpatterns = [path("meta/", self._meta_view(), name=f"{self.namespace}-meta")]
        for key, admin in self._registry.items():
            viewset = build_viewset(admin)
            urlpatterns += [
                path(f"{key}/", viewset.as_view({"get": "list", "post": "create"})),
                path(f"{key}/meta/", viewset.as_view({"get": "meta"})),
                path(f"{key}/actions/<str:action_name>/", viewset.as_view({"post": "run_action"})),
                path(f"{key}/autocomplete/<str:field_name>/", viewset.as_view({"get": "autocomplete"})),
                path(
                    f"{key}/<int:pk>/",
                    viewset.as_view(
                        {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
                    ),
                ),
            ]
        return urlpatterns


platform_site = AdminSite("platform-admin", "Platform Admin", permission_classes=(IsSuperUser,))
studio_site = AdminSite("studio-admin", "Studio Admin", permission_classes=(IsCoachOrOwner,), tenant_only=True)
