from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.core.models import Tenant
from apps.demo_seed.registry import list_niches, load_niche


class Command(BaseCommand):
    help = (
        "Seed (or re-seed) all niche demo tenants under apps/demo_seed/data/. "
        "By default, niches that already exist as demo tenants are skipped. "
        "Pass --force to tear them down and recreate."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Recreate demo tenants even if they already exist.",
        )

    def handle(self, *args, **options):
        niches = list_niches()

        if not niches:
            self.stdout.write(self.style.WARNING("No niche modules found."))
            return

        force = options["force"]
        for niche in niches:
            module = load_niche(niche)
            slug = module.TENANT["slug"]
            exists = Tenant.objects.filter(slug=slug, is_demo=True).exists()
            if exists and not force:
                self.stdout.write(f"⊘ {niche} (already seeded — pass --force to recreate)")
                continue

            self.stdout.write(self.style.NOTICE(f"\n→ Seeding {niche}"))
            call_command("seed_demo_tenant", niche=niche, stdout=self.stdout)

        self.stdout.write(self.style.SUCCESS("\nAll demos ready."))
