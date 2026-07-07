from .models import CommunityMember


def get_or_create_member(user):
    member, _ = CommunityMember.objects.get_or_create(
        user=user,
        defaults={
            "display_name": user.name or user.email.split("@")[0],
            "avatar_url": user.avatar_url or "",
        },
    )
    return member
