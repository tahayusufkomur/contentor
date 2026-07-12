"""One-time (idempotent) migration of the Phase 1 static curated catalog
(logo_meta.json + PNGs) into CuratedLogo rows + platform object storage.

Dev: `make seed` runs it against the bind-mounted repo catalog. Prod (no
mount): run with an explicit --dir, e.g. via a one-off bind mount:
  docker compose -f docker-compose.prod.yml run --rm \\
    -v $(pwd)/frontend-customer/public/logos:/seed django \\
    python manage.py seed_curated_logos --dir /seed
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context

from apps.core.models import CuratedLogo
from apps.core.platform.uploads import _store_object


class Command(BaseCommand):
    help = "Seed CuratedLogo rows from a static catalog directory (logo_meta.json + PNGs)."

    def add_arguments(self, parser):
        parser.add_argument("--dir", default=None, help="Catalog directory (default: CURATED_LOGO_SYNC_DIR)")

    def handle(self, *args, **options):
        directory = options["dir"] or settings.CURATED_LOGO_SYNC_DIR
        if not directory:
            raise CommandError("Pass --dir or set CURATED_LOGO_SYNC_DIR.")
        meta_path = Path(directory) / "logo_meta.json"
        if not meta_path.exists():
            raise CommandError(f"{meta_path} not found.")
        entries = json.loads(meta_path.read_text())
        with schema_context("public"):
            for index, entry in enumerate(entries):
                filename = entry["filename"]
                png = Path(directory) / filename
                if not png.exists():
                    self.stderr.write(f"skip {filename}: file missing")
                    continue
                key = f"platform/curated-logos/{filename}"
                with png.open("rb") as fh:
                    _store_object(key, fh, "image/png")
                _, created = CuratedLogo.objects.update_or_create(
                    image_key=key,
                    defaults={
                        "title": entry["title"],
                        "prompt": entry.get("prompt", ""),
                        "tags": entry.get("tags", ""),
                        "position": index + 1,
                        "enabled": True,
                    },
                )
                self.stdout.write(f"{'created' if created else 'updated'} {key}")
