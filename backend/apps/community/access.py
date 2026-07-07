from rest_framework.exceptions import NotFound, PermissionDenied

from . import services
from .models import CommunitySettings


def get_member_or_deny(request, write=False):
    """Gate every content endpoint: module enabled, member not banned,
    and (for writes) not muted. Lazily creates the member row."""
    if not CommunitySettings.load().is_enabled:
        raise NotFound("Community is not enabled.")
    member = services.get_or_create_member(request.user)
    if member.is_banned:
        raise PermissionDenied("You are banned from the community.")
    if write and member.is_muted:
        raise PermissionDenied("You are muted in the community.")
    return member
