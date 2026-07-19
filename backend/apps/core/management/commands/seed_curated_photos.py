"""Idempotent seeding of the curated photo catalog (photo_meta.json + images)
into CuratedPhoto rows + platform object storage. Mirrors seed_curated_logos —
but unlike logo_meta.json, photo_meta.json IS committed to git.

Dev: run against the bind-mounted repo catalog (CURATED_PHOTO_SYNC_DIR). Prod
(no mount): pass an explicit --dir via a one-off bind mount, e.g.
  docker compose -f docker-compose.prod.yml run --rm \\
    -v $(pwd)/frontend-customer/public/curated-photos:/seed django \\
    python manage.py seed_curated_photos --dir /seed
"""

import io
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context

from apps.core.curated_logos.clean import clean_curated_png
from apps.core.models import CuratedPhoto
from apps.core.platform.uploads import _store_object


class Command(BaseCommand):
    help = "Seed CuratedPhoto rows from a static catalog directory (photo_meta.json + images)."

    def add_arguments(self, parser):
        parser.add_argument("--dir", default=None, help="Catalog directory (default: CURATED_PHOTO_SYNC_DIR)")

    def handle(self, *args, **options):
        from PIL import Image

        directory = options["dir"] or settings.CURATED_PHOTO_SYNC_DIR
        if not directory:
            raise CommandError("Pass --dir or set CURATED_PHOTO_SYNC_DIR.")
        meta_path = Path(directory) / "photo_meta.json"
        if not meta_path.exists():
            raise CommandError(f"{meta_path} not found.")
        entries = json.loads(meta_path.read_text())
        with schema_context("public"):
            for index, entry in enumerate(entries):
                filename = entry["filename"]
                path = Path(directory) / filename
                if not path.exists():
                    self.stderr.write(f"skip {filename}: file missing")
                    continue
                kind = entry.get("kind", "stock")
                if kind not in CuratedPhoto.KINDS:
                    self.stderr.write(f"skip {filename}: unknown kind {kind!r}")
                    continue
                body = path.read_bytes()
                if kind == "spot":
                    # Spot illustrations follow the logo pipeline: strip the
                    # white canvas so they blend with tenant blog themes.
                    body = clean_curated_png(body)
                with Image.open(io.BytesIO(body)) as img:
                    width, height = img.size
                key = f"platform/curated-photos/{filename}"
                content_type = "image/jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else "image/png"
                _store_object(key, io.BytesIO(body), content_type)
                _, created = CuratedPhoto.objects.update_or_create(
                    image_key=key,
                    defaults={
                        "title": entry["title"],
                        "prompt": entry.get("prompt", ""),
                        "tags": entry.get("tags", ""),
                        "alt_text": entry.get("alt_text", ""),
                        "kind": kind,
                        "width": width,
                        "height": height,
                        "position": index + 1,
                        "enabled": True,
                    },
                )
                self.stdout.write(f"{'created' if created else 'updated'} {key}")
