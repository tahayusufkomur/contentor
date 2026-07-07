from rest_framework.permissions import BasePermission


def is_moderator(user):
    return bool(
        user.is_authenticated and (user.role in ("owner", "coach") or user.is_staff)
    )


class IsCommunityModerator(BasePermission):
    def has_permission(self, request, view):
        return is_moderator(request.user)
