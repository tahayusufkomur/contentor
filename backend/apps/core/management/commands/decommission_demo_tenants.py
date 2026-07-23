"""One-off ops command: delete the legacy marketing demo tenants.

Prod runbook (after deploying this release):
    docker compose -f docker-compose.prod.yml exec django \
        python manage.py decommission_demo_tenants --yes

Dev note: the 3 dev tenants (demo-fitness/demo-pilates/demo-yoga, seeded by
`seed_dev_tenants`) share schema names with entries in the niche registry —
running this against the dev stack deletes them too; reseed with `make seed`.
The prod bucket's demo/* media objects are NOT touched by this command (they
remain the mirror source for dev's `mirror_demo_assets`).

Scope: only Tenant rows whose schema_name matches a niche in
`apps.demo_seed.registry.list_niches()` are ever considered — this is
deliberately not a "delete every tenant" command.
"""

from django.core.management.base import BaseCommand

from apps.core.models import Domain, Tenant
from apps.demo_seed.registry import list_niches, load_niche


class Command(BaseCommand):
    help = "Delete legacy marketing demo tenants (schema + domains + row). Dry-run without --yes."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Actually delete. Omit for a dry run.")

    def handle(self, *args, **options):
        targets = []
        for niche in sorted(list_niches()):
            schema = load_niche(niche).TENANT["schema_name"]
            tenant = Tenant.objects.filter(schema_name=schema).first()
            if tenant is not None:
                targets.append(tenant)

        if not targets:
            self.stdout.write("No demo tenants found — nothing to do.")
            return

        self.stdout.write(f"Found {len(targets)} legacy demo tenant(s):")
        for t in targets:
            self.stdout.write(f"  {t.slug} ({t.schema_name})")

        if not options["yes"]:
            self.stdout.write(self.style.WARNING("Dry run — pass --yes to delete the above."))
            return

        for t in targets:
            Domain.objects.filter(tenant=t).delete()
            t.delete(force_drop=True)
            self.stdout.write(self.style.SUCCESS(f"Deleted {t.slug} ({t.schema_name})"))
