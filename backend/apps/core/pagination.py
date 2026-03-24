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
