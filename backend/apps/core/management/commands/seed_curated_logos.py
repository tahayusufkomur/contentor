"""One-time (idempotent) migration of the Phase 1 static curated catalog
(logo_meta.json + PNGs) into CuratedLogo rows + platform object storage.

Dev: `make seed` runs it against the bind-mounted repo catalog. Prod (no
mount): run with an explicit --dir, e.g. via a one-off bind mount:
  docker compose -f docker-compose.prod.yml run --rm \\
    -v $(pwd)/frontend-customer/public/logos:/seed django \\
    python manage.py seed_curated_logos --dir /seed
"""

import hashlib
import io
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context

from apps.core.curated_logos.clean import clean_curated_png
from apps.core.models import CuratedLogo
from apps.core.platform.uploads import _store_object
from apps.core.storage import get_s3_client


def _stored_md5(key):
    """md5 of the bucket object (its ETag: these are single-part uploads), or
    None when it is missing or unreadable."""
    try:
        return get_s3_client().head_object(Bucket=settings.AWS_BUCKET_NAME, Key=key)["ETag"].strip('"')
    except Exception:
        return None


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
        unchanged = 0
        with schema_context("public"):
            existing = {row.image_key: row for row in CuratedLogo.objects.all()}
            for index, entry in enumerate(entries):
                filename = entry["filename"]
                png = Path(directory) / filename
                if not png.exists():
                    self.stderr.write(f"skip {filename}: file missing")
                    continue
                key = f"platform/curated-logos/{filename}"
                defaults = {
                    "title": entry["title"],
                    "prompt": entry.get("prompt", ""),
                    "tags": entry.get("tags", ""),
                    "position": index + 1,
                    "enabled": True,
                }
                raw = png.read_bytes()
                # Re-seeding an already-seeded catalog must be cheap: every save
                # fires the mirror + trace signals (S3 round-trips, a full-table
                # read). In dev the mirror signal writes the stored object back
                # over the catalog file, so an identical md5 means nothing to do.
                # ponytail: prod has no mirror, so its raw source never matches
                # and it re-uploads every time; store a source hash as object
                # metadata if prod re-seeds ever get frequent.
                stored = _stored_md5(key) == hashlib.md5(raw, usedforsecurity=False).hexdigest()
                row = existing.get(key)
                if stored and row and all(getattr(row, field) == value for field, value in defaults.items()):
                    unchanged += 1
                    continue
                if not stored:
                    # The source art sits on an opaque white canvas; store a
                    # transparent, cropped version so it blends with tenant UIs.
                    _store_object(key, io.BytesIO(clean_curated_png(raw)), "image/png")
                _, created = CuratedLogo.objects.update_or_create(image_key=key, defaults=defaults)
                self.stdout.write(f"{'created' if created else 'updated'} {key}")
        if unchanged:
            self.stdout.write(f"{unchanged} unchanged")
