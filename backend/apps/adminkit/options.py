"""Declarative model admins for the API-driven admin kit.

A `ModelAdmin` describes how a model is listed, filtered, edited and acted on.
The kit turns one declaration into list/CRUD endpoints, a metadata endpoint
the frontends render forms and tables from, and bulk action endpoints —
the same idea as `django.contrib.admin`, but speaking JSON to the two SPAs.
"""

from __future__ import annotations

from django.db import models
from django.utils.text import slugify


def admin_action(label=None, *, style="default", confirm=None, row=False):
    """Mark a ModelAdmin method as an action.

    The method receives `(request, queryset)` and returns a user-facing
    message (str) or a dict merged into the JSON response. A returned
    `{"redirect": url}` tells the frontend to navigate there (used for
    impersonation hand-offs).

    `style` is a frontend hint (`default` | `primary` | `danger`); `confirm`
    adds a confirmation prompt. `row=True` renders the action as a per-row
    button (operating on that single object) instead of a bulk action over
    the current selection.
    """

    def decorator(func):
        func.adminkit_action = {
            "label": label or func.__name__.replace("_", " ").title(),
            "style": style,
            "confirm": confirm,
            "row": row,
        }
        return func

    return decorator


class ModelAdmin:
    """Declarative admin config for one model on one site."""

    # ---- identity / navigation ----
    label: str | None = None
    label_plural: str | None = None
    key: str | None = None  # URL segment; defaults to slugified plural
    icon: str = "database"  # lucide icon name hint for the frontends
    description: str = ""

    # ---- list ----
    list_display: tuple = ("__str__",)
    search_fields: tuple = ()
    list_filters: tuple = ()
    ordering: tuple = ("-pk",)
    list_select_related: tuple = ()
    page_size: int = 20

    # ---- form ----
    fields: tuple | None = None  # editable fields; None → all editable concrete fields
    readonly_fields: tuple = ()  # shown on detail/form but never writable
    exclude: tuple = ()

    # ---- capabilities ----
    can_create: bool = True
    can_edit: bool = True
    can_delete: bool = True
    permission_classes: tuple | None = None  # overrides the site default

    # ---- image upload fields ----
    # Fields whose value is an object-storage key set by uploading an image
    # through `image_upload_url` (see field_schema's "image" type).
    image_fields: tuple = ()
    image_upload_url: str = "/api/v1/platform/upload/"
    image_upload_prefix: str = "images"

    def __init__(self, model, site):
        self.model = model
        self.site = site
        meta = model._meta
        self.label = self.label or meta.verbose_name.title()
        self.label_plural = self.label_plural or meta.verbose_name_plural.title()
        self.key = self.key or slugify(self.label_plural)
        self.pk_name = meta.pk.name

    # ---- hooks (override per admin) ----

    def get_queryset(self, request):
        qs = self.model._default_manager.all()
        if self.list_select_related:
            qs = qs.select_related(*self.list_select_related)
        return qs

    def perform_create(self, request, serializer):
        serializer.save()

    def perform_update(self, request, serializer):
        serializer.save()

    def perform_delete(self, request, instance):
        instance.delete()

    def get_autocomplete_queryset(self, request, field_name, q):
        """Options for FK selects: related model's objects, optionally searched."""
        field = self.model._meta.get_field(field_name)
        related = field.remote_field.model
        qs = related._default_manager.all()
        if q:
            for candidate in ("name", "title", "email", "slug"):
                if any(f.name == candidate for f in related._meta.concrete_fields):
                    return qs.filter(**{f"{candidate}__icontains": q})
        return qs

    # ---- derived config ----

    def get_form_fields(self) -> list[str]:
        """Writable field names, declaration order preserved."""
        if self.fields is not None:
            return [f for f in self.fields if f not in self.exclude]
        names = []
        for f in self.model._meta.concrete_fields:
            if f.primary_key or not f.editable or f.auto_created:
                continue
            if isinstance(f, models.DateTimeField | models.DateField) and (
                getattr(f, "auto_now", False) or getattr(f, "auto_now_add", False)
            ):
                continue
            if f.name in self.exclude or f.name in self.readonly_fields:
                continue
            names.append(f.name)
        return names

    def get_serializer_field_names(self) -> list[str]:
        """Everything the API exposes: pk + form + readonly + list columns."""
        names = [self.pk_name]
        model_fields = {f.name for f in self.model._meta.concrete_fields}
        list_columns = [c for c in self.list_display if c in model_fields]
        for name in list(self.get_form_fields()) + list(self.readonly_fields) + list_columns:
            if name not in names:
                names.append(name)
        return names

    def get_computed_columns(self) -> list[str]:
        """list_display entries that are admin methods (or __str__), not model fields."""
        model_fields = {f.name for f in self.model._meta.concrete_fields}
        return [c for c in self.list_display if c not in model_fields]

    def get_actions(self) -> dict[str, dict]:
        actions = {}
        for name in dir(type(self)):
            attr = getattr(type(self), name, None)
            meta = getattr(attr, "adminkit_action", None)
            if meta:
                actions[name] = meta
        return actions

    def compute_column(self, name, obj):
        if name == "__str__":
            return str(obj)
        value = getattr(self, name)(obj)
        return value if isinstance(value, bool | int | float) or value is None else str(value)

    def column_label(self, name) -> str:
        if name == "__str__":
            return self.label
        attr = getattr(type(self), name, None)
        if attr is not None and getattr(attr, "short_description", None):
            return attr.short_description
        return name.replace("_", " ").title()
