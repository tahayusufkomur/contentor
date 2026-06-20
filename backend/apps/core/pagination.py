from rest_framework.pagination import LimitOffsetPagination


class StandardPagination(LimitOffsetPagination):
    default_limit = 20
    max_limit = 100


def apply_ordering(qs, request, allowed_fields):
    """
    Read ?ordering= param, validate against allowed_fields, apply to queryset.
    Prefix with - for descending. Falls back to -created_at.
    """
    ordering = request.query_params.get("ordering", "").strip()
    if ordering:
        # Strip leading - to check base field name
        base_field = ordering.lstrip("-")
        if base_field in allowed_fields:
            return qs.order_by(ordering)
    return qs.order_by("-created_at")


def apply_tag_filter(qs, request):
    """
    Read ?tags= param (comma-separated tag ids) and narrow ``qs`` to rows
    carrying ANY of those tags. Used by the admin lists to group/filter by
    the flat per-content-type tags. No-op when the param is absent/blank.
    Requires the model to have a ``tags`` M2M.
    """
    raw = request.query_params.get("tags", "").strip()
    if not raw:
        return qs
    ids = [int(part) for part in raw.split(",") if part.strip().isdigit()]
    if not ids:
        return qs
    return qs.filter(tags__id__in=ids).distinct()
