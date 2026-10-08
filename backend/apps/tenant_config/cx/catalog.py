"""Loader for the AI component catalog (packages/shared/src/cx/primitives.json,
synced into sections_manifest/cx/ by `make sections-sync`). Pure Python, no
Django, like apps.tenant_config.sections."""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parent.parent / "sections_manifest" / "cx" / "primitives.json"
DYNAMIC_SOURCES = ("courses", "plans", "events")


@cache
def catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text())


def primitives() -> dict:
    return catalog()["primitives"]


def limits() -> dict:
    return catalog()["limits"]


def icons() -> list[str]:
    return catalog()["icons"]
