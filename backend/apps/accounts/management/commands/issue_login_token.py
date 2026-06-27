"""Dev-only: print a session JWT for a seeded user.

Used by the screenshot-map crawler (scripts/screenshot-map) to log in as each
role without an email round-trip. Mints the same session token the magic-link
verify flow produces, then the crawler injects it as the contentor_access_token
cookie. Refuses to run outside DEBUG so it can never mint a login in prod.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.accounts.tokens import create_jwt
from apps.core.demo.views import DEMO_COACH_EMAIL, DEMO_STUDENT_EMAIL
from apps.core.models import Tenant


class Command(BaseCommand):
    help = "Print a session JWT for a seeded user (dev only)."

    def add_arguments(self, parser):
        parser.add_argument("--role", required=True, choices=["superadmin", "coach", "student"])
        parser.add_argument("--tenant", default="", help="Tenant slug (required for coach/student)")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("issue_login_token is dev-only (DEBUG must be True).")

        role = options["role"]
        slug = options["tenant"]

        if role == "superadmin":
            tenant, _ = Tenant.objects.get_or_create(
                schema_name="public",
                defaults={
                    "name": "Contentor Platform",
                    "slug": "public",
                    "subdomain": "public",
                    "owner_email": "",
                },
            )
            user = User.objects.filter(is_superuser=True).order_by("id").first()
            if user is None:
                raise CommandError("No superuser found. Run `make seed` with CONTENTOR_SUPERUSERS set.")
            self.stdout.write(create_jwt(user, tenant))
            return

        if not slug:
            raise CommandError(f"--tenant is required for role={role}")
        tenant = Tenant.objects.get(slug=slug)
        email = DEMO_COACH_EMAIL if role == "coach" else DEMO_STUDENT_EMAIL
        with tenant_context(tenant):
            user = User.objects.filter(email=email).first()
            if user is None:
                raise CommandError(f"No {role} user '{email}' in tenant '{slug}'. Run `make seed-demos`.")
            self.stdout.write(create_jwt(user, tenant))
