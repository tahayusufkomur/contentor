"""Local dev only: the developer's own email as an owner of every tenant on the dev stack, so they can sign in
to any site there (settings.DEV_TENANT_ADMINS, set in dev settings; empty in tests and absent in prod).

A tenant gets it right after its own owner is saved, whichever path made the tenant (signup, the seed
commands, the eval tool): the coach stays the first owner, the one the app takes for "the coach".
`manage.py dev_tenant_admins` gives it to the tenants already there.
"""

from django.conf import settings
from django.db import connection
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import User


def emails() -> list[str]:
    return [e.lower() for e in getattr(settings, "DEV_TENANT_ADMINS", None) or []]


def grant(region: str = "global") -> int:
    """The developers as owners of the current tenant (made, or raised from student); how many changed."""
    changed = 0
    for email in emails():
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            User.objects.create_user(email=email, name=email.split("@")[0], role="owner", is_staff=True, region=region)
            changed += 1
        elif user.role != "owner" or not user.is_staff:
            user.role, user.is_staff = "owner", True
            user.save(update_fields=["role", "is_staff"])
            changed += 1
    return changed


@receiver(post_save, sender=User)
def _after_the_owner(sender, instance, created, **kwargs):
    if not created or instance.role != "owner" or connection.schema_name == "public":
        return
    if not emails() or instance.email.lower() in emails():
        return
    grant(instance.region or "global")
