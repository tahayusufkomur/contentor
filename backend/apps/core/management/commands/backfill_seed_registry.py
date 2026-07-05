"""Best-effort demo registry backfill for tenants seeded BEFORE the registry
existed. Registers objects that are recognizably demo (media pointing at the
shared demo/* bucket keys, and content referencing that media). Run
consciously, per tenant; never wired into deploy.

Usage: python manage.py backfill_seed_registry <schema_name>
"""

from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.core.models import Tenant


class Command(BaseCommand):
    help = "Register recognizably-demo objects of one tenant in the SeededObject registry."

    def add_arguments(self, parser):
        parser.add_argument("schema_name")

    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(schema_name=options["schema_name"])
        except Tenant.DoesNotExist as exc:
            raise CommandError(f"No tenant {options['schema_name']}") from exc

        with tenant_context(tenant):
            from apps.billing.models import Bundle, SubscriptionPlan
            from apps.courses.models import Course, Video
            from apps.downloads.models import DownloadFile
            from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
            from apps.media.models import Photo
            from apps.tenant_config.seeding import register_seeded

            demo_photos = list(Photo.objects.filter(s3_key__startswith="demo/"))
            demo_videos = list(Video.objects.filter(s3_key__startswith="demo/"))
            objs = [*demo_photos, *demo_videos]
            objs += list(Course.objects.filter(thumbnail__in=demo_photos))
            objs += list(DownloadFile.objects.filter(file_url__startswith="demo/"))
            for model in (LiveClass, LiveStream, ZoomClass, OnsiteEvent):
                objs += list(model.objects.filter(thumbnail__in=demo_photos))
            # Plans/bundles only if the tenant was template-seeded (they have
            # no media signature to key off).
            if tenant.template_seed_status == "ready":
                objs += list(SubscriptionPlan.objects.all())
                objs += list(Bundle.objects.all())

            register_seeded(objs, niche=tenant.template_niche or "backfill")
            self.stdout.write(self.style.SUCCESS(f"Registered {len(objs)} objects."))
