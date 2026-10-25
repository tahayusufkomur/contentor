"""Ask the image service where the subject sits in photos placed before
media.Photo kept it (its subject_placement), so their pages crop toward it.

Library copies are asked for by their catalog id, a coach's own photos by
their upload id. Photos it has no answer for stay as they are, so a rerun asks
only about those. Stops at the first failure: a service that is down is not
asked once per photo.
"""

from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context

from apps.core.curated_images import client
from apps.core.curated_images.cache import asset_id_from_key
from apps.core.models import Tenant


class Command(BaseCommand):
    help = "Fill in where the subject sits in photos placed before it was kept."

    def handle(self, *args, **options):
        from apps.media.models import Photo

        filled = 0
        for tenant in Tenant.objects.exclude(schema_name="public"):
            with tenant_context(tenant):
                for photo in Photo.objects.filter(subject_placement=""):
                    asset_id = asset_id_from_key(photo.s3_key)
                    try:
                        if asset_id:
                            found = client.get(asset_id)
                        elif photo.catalog_id:
                            found = client.private_status(photo.catalog_id)
                        else:
                            continue
                    except client.CuratedImageError as exc:
                        self.stderr.write(f"stopped at {tenant.schema_name} {photo.pk}: {exc}")
                        self.stdout.write(f"{filled} photos placed")
                        return
                    if found and found.subject_placement:
                        Photo.objects.filter(pk=photo.pk).update(subject_placement=found.subject_placement)
                        filled += 1
        self.stdout.write(f"{filled} photos placed")
