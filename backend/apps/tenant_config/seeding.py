"""Demo-seed registry helpers.

`fingerprint_for` hashes the coach-editable content of a seeded object so
"has the coach touched this since seeding?" stays answerable long after the
fact. The seeder and the erase endpoint both use it — one implementation.
"""

from __future__ import annotations

import hashlib
import json

from django.contrib.contenttypes.models import ContentType

from .models import SeededObject

# Bookkeeping fields — mutate on their own, never mark coach intent.
_SKIP_FIELDS = {"created_at", "updated_at", "download_count"}


def fingerprint_for(obj) -> str:
    payload = {}
    for field in obj._meta.concrete_fields:
        if field.primary_key or field.name in _SKIP_FIELDS:
            continue
        payload[field.name] = str(getattr(obj, field.attname))
    if obj._meta.label == "courses.Course":
        # Fold in modules + lessons: editing a lesson protects the course.
        payload["_modules"] = [
            {
                "title": module.title,
                "order": module.order,
                "lessons": [
                    {
                        "title": lesson.title,
                        "order": lesson.order,
                        "content_html": lesson.content_html,
                        "video_url": lesson.video_url,
                    }
                    for lesson in module.lessons.all().order_by("order", "pk")
                ],
            }
            for module in obj.modules.all().order_by("order", "pk")
        ]
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def register_seeded(objs, niche: str = "") -> None:
    rows = []
    for obj in objs:
        # Fingerprint the DB-canonical representation, not the in-memory one:
        # freshly-created objects can carry field values in Python-native
        # types (e.g. Course.price defaults to int 0) that differ from what
        # the DB round-trips them as (Decimal('0.00')) — same value, string
        # differently, different hash. The erase endpoint always fingerprints
        # a freshly-fetched row, so registration must match that baseline.
        obj.refresh_from_db()
        rows.append(
            SeededObject(
                content_type=ContentType.objects.get_for_model(obj, for_concrete_model=True),
                object_id=str(obj.pk),
                fingerprint=fingerprint_for(obj),
                niche=niche,
            )
        )
    SeededObject.objects.bulk_create(rows, ignore_conflicts=True)


def refresh_seeded_fingerprints(objs) -> None:
    """Re-baseline SeededObject fingerprints after a system-driven mutation
    (onboarding AI renames/thumbnails). Without this, AI edits made right
    after seeding would read as coach edits and break the erase flow's
    "has the coach touched this?" answer. Unregistered objects are skipped."""
    for obj in objs:
        obj.refresh_from_db()
        SeededObject.objects.filter(
            content_type=ContentType.objects.get_for_model(obj, for_concrete_model=True),
            object_id=str(obj.pk),
        ).update(fingerprint=fingerprint_for(obj))
