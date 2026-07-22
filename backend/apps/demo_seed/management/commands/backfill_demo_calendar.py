"""Add demo blog posts + email campaigns to already-seeded demo tenants, so the
coach content calendar (/admin/calendar) has content without a destructive
`seed_demo_tenant` rebuild. Idempotent — safe to re-run.

    python manage.py backfill_demo_calendar            # all is_demo tenants
    python manage.py backfill_demo_calendar --schema demo_pilates
"""

from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.demo_seed.calendar_content import seed_blog_posts, seed_email_campaigns


class Command(BaseCommand):
    help = "Backfill demo blog posts + email campaigns into existing demo tenants (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            help="Only backfill this schema (default: every is_demo tenant).",
        )

    def handle(self, *args, **options):
        tenants = Tenant.objects.filter(is_demo=True)
        if options.get("schema"):
            tenants = tenants.filter(schema_name=options["schema"])

        if not tenants:
            self.stdout.write(self.style.WARNING("No matching demo tenants found."))
            return

        for tenant in tenants:
            with tenant_context(tenant):
                owner = User.objects.filter(role="owner").order_by("id").first()
                if owner is None:
                    self.stdout.write(f"  {tenant.schema_name}: skipped (no owner user)")
                    continue
                posts = seed_blog_posts(owner)
                campaigns = seed_email_campaigns(owner)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {tenant.schema_name}: {len(posts)} blog posts, {len(campaigns)} email campaigns"
                    )
                )
