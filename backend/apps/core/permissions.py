from rest_framework.permissions import BasePermission


def is_coach_or_owner(user) -> bool:
    """Single source of truth for the coach/owner role membership test.

    Use in mixed-method @api_view functions (visibility filters, per-branch 403
    or 404 guards) where a DRF permission class can't gate a single method."""
    return bool(getattr(user, "is_authenticated", False)) and getattr(user, "role", None) in ("owner", "coach")


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "owner"


class IsCoachOrOwner(BasePermission):
    def has_permission(self, request, view):
        return is_coach_or_owner(request.user)


class IsSuperUser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser
