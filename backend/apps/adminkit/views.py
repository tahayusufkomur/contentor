"""Generic viewset powering every registered model's endpoints."""

from __future__ import annotations

from django.core.exceptions import FieldDoesNotExist
from django.db import connection
from django.db.models import ProtectedError, Q
from django.http import Http404
from django_tenants.utils import get_public_schema_name
from rest_framework import status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.core.storage import sign_if_s3_key

from .introspection import build_serializer, model_meta


class AdminKitViewSet(viewsets.ModelViewSet):
    """CRUD + meta + actions + autocomplete for one ModelAdmin.

    Subclasses are generated per registration (see `build_viewset`); all
    behaviour is driven by the `model_admin` declaration.
    """

    model_admin = None  # set by build_viewset

    def initial(self, request, *args, **kwargs):
        # Tenant-only sites (the coach studio) have no tables in the public
        # schema — 404 before auth even runs.
        if self.model_admin.site.tenant_only and connection.schema_name == get_public_schema_name():
            raise Http404
        super().initial(request, *args, **kwargs)

    def get_serializer_class(self):
        return build_serializer(self.model_admin)

    def get_queryset(self):
        return self.model_admin.get_queryset(self.request)

    # ---- list: search / filters / ordering ----

    def filter_queryset(self, queryset):
        admin = self.model_admin
        params = self.request.query_params

        q = params.get("q", "").strip()
        if q and admin.search_fields:
            cond = Q()
            for field in admin.search_fields:
                cond |= Q(**{f"{field}__icontains": q})
            queryset = queryset.filter(cond)
            if any("__" in f for f in admin.search_fields):
                queryset = queryset.distinct()

        needs_distinct = False
        for name in admin.list_filters:
            raw = params.get(name, "").strip()
            if raw == "":
                continue
            if raw.lower() in ("true", "false"):
                queryset = queryset.filter(**{name: raw.lower() == "true"})
            else:
                queryset = queryset.filter(**{name: raw})
                try:
                    if admin.model._meta.get_field(name).many_to_many:
                        needs_distinct = True
                except Exception:  # noqa: S110
                    pass
        if needs_distinct:
            queryset = queryset.distinct()

        ordering = params.get("ordering", "").strip() or (admin.ordering[0] if admin.ordering else "")
        if ordering:
            bare = ordering.lstrip("-")
            concrete = {f.name for f in admin.model._meta.concrete_fields} | {"pk"}
            if bare in concrete:
                queryset = queryset.order_by(ordering)
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        rows = self.get_serializer(page, many=True).data
        for obj, row in zip(page, rows, strict=False):
            for name in self.model_admin.get_computed_columns():
                row[name] = self.model_admin.compute_column(name, obj)
            for name in self.model_admin.image_fields:
                key = row.get(name)
                row[name] = {"key": key, "url": sign_if_s3_key(key)} if key else None
        return self.get_paginated_response(rows)

    # ---- writes, gated by capabilities and delegated to admin hooks ----

    def create(self, request, *args, **kwargs):
        if not self.model_admin.can_create:
            return Response({"detail": "Creating is not allowed."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not self.model_admin.can_edit:
            return Response({"detail": "Editing is not allowed."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not self.model_admin.can_delete:
            return Response({"detail": "Deleting is not allowed."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            label = self.model_admin.label.lower()
            return Response(
                {"detail": f"This {label} is referenced by other records and cannot be deleted."},
                status=status.HTTP_409_CONFLICT,
            )

    def perform_create(self, serializer):
        self.model_admin.perform_create(self.request, serializer)

    def perform_update(self, serializer):
        self.model_admin.perform_update(self.request, serializer)

    def perform_destroy(self, instance):
        self.model_admin.perform_delete(self.request, instance)

    # ---- extra endpoints ----

    def meta(self, request, *args, **kwargs):
        return Response(model_meta(self.model_admin))

    def run_action(self, request, action_name=None, **kwargs):
        actions = self.model_admin.get_actions()
        if action_name not in actions:
            raise Http404
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids:
            return Response({"detail": "Provide a non-empty `ids` list."}, status=status.HTTP_400_BAD_REQUEST)
        queryset = self.filter_queryset(self.get_queryset()).filter(pk__in=ids)
        result = getattr(self.model_admin, action_name)(request, queryset)
        payload = result if isinstance(result, dict) else {"detail": str(result)}
        return Response(payload)

    def autocomplete(self, request, field_name=None, **kwargs):
        model = self.model_admin.model
        try:
            field = model._meta.get_field(field_name)
        except FieldDoesNotExist:
            raise Http404 from None
        if not field.is_relation:
            raise Http404
        q = request.query_params.get("q", "").strip()
        queryset = self.model_admin.get_autocomplete_queryset(request, field_name, q)
        return Response({"results": [{"value": o.pk, "label": str(o)} for o in queryset[:50]]})


def build_viewset(admin) -> type:
    pagination = type(
        "Pagination",
        (PageNumberPagination,),
        {"page_size": admin.page_size, "page_size_query_param": "page_size", "max_page_size": 100},
    )
    return type(
        f"{admin.model.__name__}AdminViewSet",
        (AdminKitViewSet,),
        {
            "model_admin": admin,
            "pagination_class": pagination,
            "permission_classes": list(admin.permission_classes or admin.site.permission_classes),
        },
    )
