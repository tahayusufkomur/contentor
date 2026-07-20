"""Serializer factory + field-schema extraction.

One auto-built ModelSerializer per admin serves list, detail and writes.
`field_schema()` turns each serializer field into the JSON contract the
frontends render widgets from:

    {"name", "label", "type", "required", "read_only", "help_text",
     "default"?, "choices"?, "max_length"?, "min_value"?, "max_value"?,
     "decimal_places"?, "upload_url"?, "upload_prefix"?}
"""

from __future__ import annotations

from django.core.exceptions import FieldDoesNotExist
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from rest_framework import serializers
from rest_framework.fields import empty


class LabeledRelatedField(serializers.PrimaryKeyRelatedField):
    """FK field that reads as `{"value": pk, "label": str(obj)}`, writes a pk."""

    def use_pk_only_optimization(self):
        return False

    def to_representation(self, value):
        return {"value": value.pk, "label": str(value)}


_SERIALIZER_CACHE: dict[int, type] = {}


def build_serializer(admin) -> type:
    cache_key = id(admin)
    if cache_key not in _SERIALIZER_CACHE:
        editable = set(admin.get_form_fields())
        names = admin.get_serializer_field_names()
        read_only = tuple(n for n in names if n not in editable and n != admin.pk_name)

        meta = type(
            "Meta",
            (),
            {"model": admin.model, "fields": names, "read_only_fields": read_only},
        )
        _SERIALIZER_CACHE[cache_key] = type(
            f"{admin.model.__name__}AdminSerializer",
            (serializers.ModelSerializer,),
            {"Meta": meta, "serializer_related_field": LabeledRelatedField},
        )
    return _SERIALIZER_CACHE[cache_key]


def _scalar_default(model, name, field):
    default = field.default
    if default is empty or callable(default):
        # DRF leaves model-level defaults to .save(); surface them anyway so
        # auto-built forms start from the value the model would use.
        try:
            model_field = model._meta.get_field(name)
        except Exception:
            return None
        if not model_field.has_default() or callable(model_field.default):
            return None
        default = model_field.default
    if isinstance(default, bool | int | float | str):
        return default
    return None


def _field_type(model, name, field) -> str:
    if isinstance(field, serializers.ManyRelatedField):
        return "m2m"
    if isinstance(field, serializers.PrimaryKeyRelatedField):
        return "fk"
    if isinstance(field, serializers.BooleanField):
        return "boolean"
    if isinstance(field, serializers.MultipleChoiceField):
        return "multichoice"
    if isinstance(field, serializers.ChoiceField):
        return "choice"
    if isinstance(field, serializers.IntegerField):
        return "integer"
    if isinstance(field, serializers.DecimalField | serializers.FloatField):
        return "decimal"
    if isinstance(field, serializers.DateTimeField):
        return "datetime"
    if isinstance(field, serializers.DateField):
        return "date"
    if isinstance(field, serializers.EmailField):
        return "email"
    if isinstance(field, serializers.URLField):
        return "url"
    if isinstance(field, serializers.JSONField):
        return "json"
    try:
        model_field = model._meta.get_field(name)
    except FieldDoesNotExist:
        return "string"
    return "text" if isinstance(model_field, models.TextField) else "string"


def field_schema(admin, name, field) -> dict:
    schema = {
        "name": name,
        "label": str(field.label or name.replace("_", " ").title()),
        "type": _field_type(admin.model, name, field),
        "required": bool(field.required),
        "read_only": bool(field.read_only),
        "help_text": str(field.help_text or ""),
    }
    if name in getattr(admin, "image_fields", ()):
        schema["type"] = "image"
        schema["upload_url"] = admin.image_upload_url
        schema["upload_prefix"] = admin.image_upload_prefix
    default = _scalar_default(admin.model, name, field)
    if default is not None:
        schema["default"] = default
    if getattr(field, "max_length", None):
        schema["max_length"] = field.max_length
    if isinstance(field, serializers.DecimalField):
        schema["decimal_places"] = field.decimal_places
    # NB: order matters — RelatedField.choices is a property that evaluates
    # the queryset, so only touch .choices once we know this is a choice type.
    if schema["type"] in ("choice", "multichoice") and getattr(field, "choices", None):
        schema["choices"] = [{"value": v, "label": str(label)} for v, label in field.choices.items()]
    for validator in getattr(field, "validators", []):
        if isinstance(validator, MinValueValidator):
            schema["min_value"] = validator.limit_value
        elif isinstance(validator, MaxValueValidator):
            schema["max_value"] = validator.limit_value
    if getattr(field, "max_value", None) is not None:
        schema["max_value"] = field.max_value
    if getattr(field, "min_value", None) is not None:
        schema["min_value"] = field.min_value
    return schema


def _relation_filter_choices(model, name):
    """If `name` is a FK or M2M on `model`, return its options as filter
    choices `[{value, label}]`; otherwise None. Lets `list_filters` target a
    relation (e.g. an M2M tag) even when it isn't a serializer field."""
    try:
        field = model._meta.get_field(name)
    except FieldDoesNotExist:
        return None
    if getattr(field, "is_relation", False) and (
        getattr(field, "many_to_many", False) or getattr(field, "many_to_one", False)
    ):
        related = field.related_model
        return [{"value": obj.pk, "label": str(obj)} for obj in related.objects.all()]
    return None


def filter_schema(admin) -> list[dict]:
    """Filter descriptors for `list_filters`: boolean/choice/fk get selects,
    a relation (FK/M2M) becomes a choice of its related objects, everything
    else a text input matched exactly."""
    serializer = build_serializer(admin)()
    out = []
    qs = admin.model._default_manager.all()
    for name in admin.list_filters:
        field = serializer.fields.get(name)
        if field is not None:
            schema = field_schema(admin, name, field)
            ftype = schema["type"] if schema["type"] in ("boolean", "choice", "fk") else "string"
            entry = {"name": name, "label": schema["label"], "type": ftype, "total_count": qs.count()}

            if ftype in ("choice", "boolean"):
                if ftype == "boolean" and "choices" not in schema:
                    schema["choices"] = [{"value": "true", "label": "Yes"}, {"value": "false", "label": "No"}]
                if "choices" in schema:
                    new_choices = []
                    for c in schema["choices"]:
                        val = c["value"]
                        filter_val = True if val == "true" else False if val == "false" else val
                        count = qs.filter(**{name: filter_val}).count()
                        new_choices.append({"value": c["value"], "label": f"{c['label']} ({count})"})
                    entry["choices"] = new_choices
                    entry["type"] = "choice"  # Force choices UI instead of boolean fallback
            elif "choices" in schema:
                entry["choices"] = schema["choices"]

            out.append(entry)
            continue
        # Not a serializer field — support relations (e.g. an M2M tag) directly.
        choices = _relation_filter_choices(admin.model, name)
        if choices is not None:
            new_choices = []
            for c in choices:
                count = qs.filter(**{name: c["value"]}).count()
                new_choices.append({"value": c["value"], "label": f"{c['label']} ({count})"})
            out.append(
                {
                    "name": name,
                    "label": name.replace("_", " ").title(),
                    "type": "choice",
                    "choices": new_choices,
                    "total_count": qs.count(),
                }
            )
    return out


def model_meta(admin) -> dict:
    """The full per-model contract: columns, filters, form fields, actions."""
    serializer = build_serializer(admin)()
    model_fields = set(serializer.fields.keys())

    columns = []
    for name in admin.list_display:
        if name in model_fields:
            schema = field_schema(admin, name, serializer.fields[name])
            column = {
                "name": name,
                "label": schema["label"],
                "type": schema["type"],
                "sortable": True,
            }
            if "choices" in schema:
                column["choices"] = schema["choices"]
        else:
            column = {
                "name": name,
                "label": admin.column_label(name),
                "type": "computed",
                "sortable": False,
            }
        columns.append(column)

    form_names = admin.get_form_fields() + [f for f in admin.readonly_fields if f in model_fields]
    form_fields = [field_schema(admin, name, serializer.fields[name]) for name in form_names]

    actions = [{"name": name, **meta} for name, meta in sorted(admin.get_actions().items())]

    return {
        "key": admin.key,
        "label": admin.label,
        "label_plural": admin.label_plural,
        "icon": admin.icon,
        "description": admin.description,
        "pk_field": admin.pk_name,
        "list_display": columns,
        "search_enabled": bool(admin.search_fields),
        "filters": filter_schema(admin),
        "form_fields": form_fields,
        "actions": actions,
        "can_create": admin.can_create,
        "can_edit": admin.can_edit,
        "can_delete": admin.can_delete,
        "default_ordering": admin.ordering[0] if admin.ordering else f"-{admin.pk_name}",
        "page_size": admin.page_size,
        "list_mode": admin.list_mode,
        "gallery_image_field": admin.gallery_image_field,
    }
