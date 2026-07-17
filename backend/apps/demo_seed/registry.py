"""JSON-backed registry of demo-tenant content.

IMPORT-PURITY CONSTRAINT: apps.core (seed_plans, demo/seed_template) imports
this module. It must only ever import from the stdlib — importing Django or
anything under apps.* here would recreate the core<->demo_seed import cycle
this app exists to remove.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

DATA_DIR = Path(__file__).parent / "data"


def list_niches() -> list[str]:
    """Niche keys, sorted — one per data/<niche>.json file."""
    return sorted(p.stem for p in DATA_DIR.glob("*.json"))


def load_niche(niche: str) -> SimpleNamespace:
    """Load one niche's content. Attributes: TENANT, CONFIG, COURSES."""
    path = DATA_DIR / f"{niche}.json"
    with path.open(encoding="utf-8") as fh:
        return SimpleNamespace(**json.load(fh))
