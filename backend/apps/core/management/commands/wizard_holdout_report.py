"""Per-bucket onboarding funnel: signups vs. published, for the wizard holdout.

Verify->publish is the experiment's primary metric; this is the manual readout
the rollout decision uses. Kept a command (not a dashboard) deliberately — it
is a periodic check, not a live surface.
"""

import json as jsonlib
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.core.models import Tenant
from apps.core.onboarding.experiments import WIZARD_BUCKETS


class Command(BaseCommand):
    help = "Report signups and publish rate per wizard holdout bucket."

    def add_arguments(self, parser):
        parser.add_argument("--since-days", type=int, default=30)
        parser.add_argument("--json", action="store_true", dest="as_json")

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=options["since_days"])
        report = {}
        for bucket in WIZARD_BUCKETS:
            qs = Tenant.objects.filter(wizard_bucket=bucket, created_at__gte=cutoff).exclude(schema_name="public")
            signups = qs.count()
            published = qs.filter(is_published=True).count()
            report[bucket] = {
                "signups": signups,
                "published": published,
                "publish_rate": round(published / signups, 4) if signups else 0.0,
            }
        if options["as_json"]:
            self.stdout.write(jsonlib.dumps(report))
            return
        for bucket, row in report.items():
            self.stdout.write(
                f"{bucket:>10}: {row['signups']:>5} signups  "
                f"{row['published']:>5} published  "
                f"{row['publish_rate'] * 100:5.1f}% publish rate"
            )
