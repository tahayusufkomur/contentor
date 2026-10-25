from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.accounts import dev_admins
from apps.core.models import Tenant


class Command(BaseCommand):
    help = "Local dev: make settings.DEV_TENANT_ADMINS owners of every tenant already there (new ones get it)."

    def handle(self, *args, **options):
        if not settings.DEBUG or not dev_admins.emails():
            raise CommandError("DEV_TENANT_ADMINS is a local dev setting: it is empty here.")
        tenants = list(Tenant.objects.exclude(schema_name="public"))
        changed = 0
        for tenant in tenants:
            with tenant_context(tenant):
                changed += dev_admins.grant(tenant.region or "global")
        self.stdout.write(f"{', '.join(dev_admins.emails())}: owner of {len(tenants)} tenants ({changed} changed)")
