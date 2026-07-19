"""Curated photo library: model, seed command, coach search + materialize
endpoints. Spec: docs/superpowers/specs/2026-07-19-curated-photos-design.md."""

import pytest
from django_tenants.utils import schema_context

from apps.core.models import CuratedPhoto

pytestmark = pytest.mark.django_db


def _photo_row(**overrides):
    defaults = {
        "title": "Sunrise run",
        "tags": "fitness, running, morning",
        "alt_text": "runner at sunrise",
        "kind": "hero",
        "image_key": "platform/curated-photos/sunrise_run.png",
        "width": 1600,
        "height": 900,
    }
    defaults.update(overrides)
    return CuratedPhoto.objects.create(**defaults)


def test_kinds_constants():
    assert CuratedPhoto.KINDS == ["hero", "stock", "spot", "texture", "divider", "icon"]
    assert CuratedPhoto.AI_KINDS == ("hero", "stock", "spot")


def test_position_auto_appends(restore_public):
    with schema_context("public"):
        first = _photo_row(image_key="platform/curated-photos/a.png")
        second = _photo_row(image_key="platform/curated-photos/b.png")
        assert first.position == 1
        assert second.position == 2


def test_defaults(restore_public):
    with schema_context("public"):
        row = CuratedPhoto.objects.create(title="x", image_key="platform/curated-photos/x.png")
        assert row.kind == "stock"
        assert row.enabled is True
        assert row.width is None and row.height is None
