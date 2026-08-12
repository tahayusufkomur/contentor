"""Retire the photographic half of the curated catalog.

The 584 `hero`/`stock` rows moved to the curated-image-api service (see
docs/superpowers/specs/2026-08-09-curated-images-offload-design.md). Their rows
go; their storage objects stay. Tenant media.Photo rows materialized from them
before the move reference `platform/curated-photos/...` keys directly and must
keep rendering, and nothing in this codebase deletes those objects.

Reverse re-widens the choices but cannot bring the rows back — reseed from the
service, or from the archived catalog in git history, if that is ever needed.
"""

from django.db import migrations, models

PHOTOGRAPHIC_KINDS = ["hero", "stock"]
DECORATIVE_KINDS = ["spot", "texture", "divider", "icon"]


def drop_photographic_rows(apps, schema_editor):
    CuratedPhoto = apps.get_model("core", "CuratedPhoto")
    CuratedPhoto.objects.filter(kind__in=PHOTOGRAPHIC_KINDS).delete()


def noop(apps, schema_editor):
    """Nothing to restore: the rows are gone and the catalog they described now
    lives in another service."""


class Migration(migrations.Migration):
    dependencies = [("core", "0037_copilotsettings")]

    operations = [
        migrations.RunPython(drop_photographic_rows, noop),
        migrations.AlterField(
            model_name="curatedphoto",
            name="kind",
            field=models.CharField(
                choices=[(kind, kind) for kind in DECORATIVE_KINDS],
                default="spot",
                max_length=10,
            ),
        ),
    ]
