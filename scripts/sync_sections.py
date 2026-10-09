#!/usr/bin/env python3
"""Copy the section manifest (packages/shared/src/sections) and the AI component catalog (packages/shared/src/cx) into the backend.

The Django build context is ./backend only, so the backend keeps a synced copy
of families.json + styles/<id>.json under apps/tenant_config/sections_manifest/.

    python3 scripts/sync_sections.py          # copy (deletes stale style copies)
    python3 scripts/sync_sections.py --check  # exit 1 on drift or an invalid enabled style
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "packages/shared/src/sections"
DST = ROOT / "backend/apps/tenant_config/sections_manifest"
CX_SRC = ROOT / "packages/shared/src/cx/primitives.json"
CX_NAME = "cx/primitives.json"


# The structures a style can build its story / benefits / howItWorks with (style.bodyLayouts).
BODY_LAYOUTS = {
    "story": {"split", "letter", "pull"},
    "benefits": {"cards", "columns", "list", "bento"},
    "howItWorks": {"row", "timeline", "grid"},
}


def _expected():
    """{relative path: bytes} the backend copy must hold."""
    files = {"families.json": (SRC / "families.json").read_bytes()}
    files[CX_NAME] = CX_SRC.read_bytes()
    for path in sorted((SRC / "styles").glob("*.json")):
        files[f"styles/{path.name}"] = path.read_bytes()
    return files


def _actual():
    files = {}
    if (DST / "families.json").exists():
        files["families.json"] = (DST / "families.json").read_bytes()
    if (DST / CX_NAME).exists():
        files[CX_NAME] = (DST / CX_NAME).read_bytes()
    for path in sorted((DST / "styles").glob("*.json")):
        files[f"styles/{path.name}"] = path.read_bytes()
    return files


def _style_errors(files):
    """Every enabled style must cover every family (so any page can be
    restyled without losing a section) and offer hero "intro"."""
    manifest = json.loads(files["families.json"])
    families = manifest["families"]
    errors = []
    for name, raw in files.items():
        if not name.startswith("styles/"):
            continue
        style = json.loads(raw)
        if not style.get("enabled"):
            continue
        variants = style.get("variants") or {}
        missing = [f for f in families if not variants.get(f)]
        if missing:
            errors.append(f"{name}: enabled but has no variants for {', '.join(missing)}")
        if "intro" not in (variants.get("hero") or []):
            errors.append(f'{name}: enabled but hero variants lack "intro"')
        for page, entries in (style.get("recipes") or {}).items():
            if page not in manifest["recipes"]:
                errors.append(f"{name}: recipe for unknown page {page!r}")
            for entry in entries:
                family, _, variant = entry.partition(":")
                if family not in families:
                    errors.append(f"{name}: recipe {page!r} names unknown family {family!r}")
                elif variant and variant not in variants.get(family, []):
                    errors.append(f"{name}: recipe {page!r} names {family}:{variant}, which the style does not ship")
        for family, layout in (style.get("bodyLayouts") or {}).items():
            if layout not in BODY_LAYOUTS.get(family, ()):
                errors.append(f"{name}: bodyLayouts.{family} {layout!r} is not one of {sorted(BODY_LAYOUTS.get(family, ()))}")
        keys = set(style.get("palette") or {})
        for variant in style.get("palettes") or []:
            if not variant.get("id") or set(variant.get("palette") or {}) != keys:
                errors.append(f"{name}: palette {variant.get('id')!r} must define exactly the style's palette keys")
    return errors


def main():
    expected = _expected()
    errors = _style_errors(expected)
    if "--check" in sys.argv[1:]:
        if _actual() != expected:
            errors.insert(0, "backend section manifest is out of sync — run `make sections-sync`")
        for error in errors:
            print(f"sections: {error}", file=sys.stderr)
        return 1 if errors else 0
    (DST / "styles").mkdir(parents=True, exist_ok=True)
    (DST / "cx").mkdir(parents=True, exist_ok=True)
    for stale in set(_actual()) - set(expected):
        (DST / stale).unlink()
    for name, data in expected.items():
        (DST / name).write_bytes(data)
    print(f"sections: synced {len(expected)} file(s) into {DST.relative_to(ROOT)}")
    for error in errors:
        print(f"sections: warning: {error}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
