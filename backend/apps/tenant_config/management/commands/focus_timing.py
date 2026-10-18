"""Focus mode against the plain form: her active time to a complete course
draft, per mode, across every tenant (spec §6 item 6). A draft is complete
with a title, at least one module with a lesson, and a cover.

ponytail: the form's stamp stops at its create click, so time she spends in
the editor afterwards (adding modules, a cover) is not counted, which flatters
the form; stage 3's scripted comparison of both paths is the real gate.
"""

import json
from statistics import median

from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.tenant_config.models import FocusCreation


def summarize(rows: list[dict]) -> dict:
    """``rows``: {mode, active_ms, complete} per finished creation."""
    out = {}
    for mode in sorted({r["mode"] for r in rows}):
        mine = [r for r in rows if r["mode"] == mode]
        done = [r["active_ms"] for r in mine if r["complete"]]
        out[mode] = {"count": len(mine), "complete": len(done), "median_ms": median(done) if done else None}
    return out


def _complete(course) -> bool:
    from apps.courses.models import Lesson

    return (
        course is not None
        and bool(course.thumbnail_id or course.thumbnail_url)
        and Lesson.objects.filter(module__course=course).exists()
    )


def _rows() -> list[dict]:
    from apps.courses.models import Course

    rows = []
    for tenant in Tenant.objects.exclude(schema_name="public"):
        with tenant_context(tenant):
            for creation in FocusCreation.objects.filter(kind="course", status="done"):
                course = Course.objects.filter(pk=creation.record_id).first()
                rows.append({"mode": creation.mode, "active_ms": creation.active_ms, "complete": _complete(course)})
    return rows


class Command(BaseCommand):
    help = "Focus mode vs the plain form: median active time to a complete course draft."

    def handle(self, *args, **options):
        self.stdout.write(json.dumps(summarize(_rows()), indent=2))
