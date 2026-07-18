#!/usr/bin/env python3
"""Select and run the tests affected by the current git diff.

Design: docs/superpowers/specs/2026-07-18-selective-test-running-design.md
Invoked via `make test-changed` / `make e2e-changed`.

Usage:
    python3 scripts/select_tests.py [--mode backend|e2e] [--base REF] [--plan] [--self-test]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

SMOKE_SPEC = "00-smoke"

# Changes here can affect any backend app -> full backend suite + all e2e specs.
WIDE_PREFIXES = (
    "backend/apps/core/",
    "backend/apps/accounts/",
    "backend/apps/adminkit/",  # autodiscovers admin_panels.py from every app
    "backend/config/",
    "backend/requirements/",
    "backend/scripts/",
)
WIDE_FILES = ("backend/conftest.py", "backend/pyproject.toml", "backend/Dockerfile")

# No runtime effect on any suite.
IGNORED_PREFIXES = (
    "docs/",
    ".claude/",
    ".playwright-mcp/",
    "tools/",
    "scripts/",
    ".github/",
    "walk-shots/",
)
IGNORED_FILES = (
    ".gitignore",
    ".pre-commit-config.yaml",
    ".secrets.baseline",
    ".gitleaks.toml",
    "Makefile",
)
IGNORED_SUFFIXES = (".md",)
ROOT_IGNORED_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif")  # stray screenshots

FC_PREFIX = "frontend-customer/"
FM_PREFIX = "frontend-main/"
SHARED_PREFIX = "packages/shared/"

REPO_ROOT = Path(__file__).resolve().parent.parent
APPS_DIR = REPO_ROOT / "backend" / "apps"
SPECS_DIR = REPO_ROOT / "e2e" / "specs"
IMPACT_MAP_PATH = REPO_ROOT / "e2e" / "impact-map.json"


@dataclass
class Plan:
    backend_kind: str = "none"  # none | apps | full | full-create-db
    backend_apps: list = field(default_factory=list)
    vitest_kind: str = "none"  # none | changed | full
    e2e_kind: str = "none"  # none | specs | all
    e2e_specs: list = field(default_factory=list)
    reasons: list = field(default_factory=list)


def _longest_prefix(rel_path, mapping):
    """Return the value of the longest key in `mapping` that prefixes rel_path."""
    best = None
    for key in mapping:
        if rel_path.startswith(key) and (best is None or len(key) > len(best)):
            best = key
    return None if best is None else mapping[best]


def build_plan(changed_files, importers, backend_apps, impact_map):
    """Pure selection logic. Fail-closed: unrecognized paths widen the run."""
    plan = Plan()
    say = plan.reasons.append
    be_map = impact_map.get("backend", {})
    fc_map = impact_map.get("frontend-customer", {})
    fm_specs = impact_map.get("frontend-main", [])

    backend_full = False
    create_db = False
    touched_apps = set()
    e2e_all = False
    e2e_specs = set()
    e2e_touched = False  # something mapped (possibly to "none") -> at least smoke

    def widen(path, why):
        nonlocal backend_full, e2e_all
        backend_full = True
        e2e_all = True
        say(f"{path}: {why} -> full backend suite + all e2e specs")

    for path in sorted(set(changed_files)):
        if (
            path.startswith(IGNORED_PREFIXES)
            or path in IGNORED_FILES
            or path.endswith(IGNORED_SUFFIXES)
            or ("/" not in path and path.endswith(ROOT_IGNORED_SUFFIXES))
        ):
            continue

        if path.startswith("backend/"):
            if "/migrations/" in path:
                create_db = True
            if path.startswith(WIDE_PREFIXES) or path in WIDE_FILES:
                widen(path, "shared backend infra")
                continue
            if path.startswith("backend/apps/"):
                app = path.split("/")[2]
                if app in backend_apps:
                    touched_apps.add(app)
                    continue
            widen(path, "unrecognized backend path")
            continue

        if path.startswith("e2e/"):
            if path.startswith("e2e/specs/") and path.endswith(".spec.ts"):
                stem = path.rsplit("/", 1)[1].removesuffix(".spec.ts")
                e2e_specs.add(stem)
                e2e_touched = True
                say(f"{path}: changed spec selects itself")
            else:
                e2e_all = True
                say(f"{path}: e2e infrastructure -> all specs")
            continue

        if path.startswith(SHARED_PREFIX):
            plan.vitest_kind = "full"
            e2e_all = True
            say(f"{path}: packages/shared -> full vitest suite + all e2e specs")
            continue

        if path.startswith(FC_PREFIX):
            if plan.vitest_kind == "none":
                plan.vitest_kind = "changed"
            entry = _longest_prefix(path[len(FC_PREFIX):], fc_map)
            if entry is None:
                e2e_all = True
                say(f"{path}: unmapped frontend-customer path -> all e2e specs (fail-closed)")
            elif entry == "all":
                e2e_all = True
                say(f"{path}: mapped 'all' -> all e2e specs")
            elif entry == "none":
                e2e_touched = True
                say(f"{path}: mapped 'none' -> smoke only")
            else:
                e2e_specs.update(entry)
                e2e_touched = True
                say(f"{path}: -> e2e {', '.join(entry)}")
            continue

        if path.startswith(FM_PREFIX):
            e2e_specs.update(fm_specs)
            e2e_touched = True
            say(f"{path}: frontend-main (no unit suite; typecheck/e2e cover it) "
                f"-> e2e {', '.join(fm_specs)}")
            continue

        widen(path, "unrecognized path")

    # Backend: expand each touched app to its direct importers.
    if create_db:
        plan.backend_kind = "full-create-db"
        say("migrations changed -> full suite with --create-db (--reuse-db would miss them)")
    elif backend_full:
        plan.backend_kind = "full"
    elif touched_apps:
        selected = set(touched_apps)
        for app in sorted(touched_apps):
            extra = sorted(importers.get(app, set()) - {app})
            selected.update(extra)
            if extra:
                say(f"apps/{app} -> + direct importers: {', '.join(extra)}")
        plan.backend_kind = "apps"
        plan.backend_apps = sorted(selected)

    # E2e mapping for directly-touched backend apps (not importers).
    if not e2e_all:
        for app in sorted(touched_apps):
            entry = be_map.get(app)
            if entry is None:
                e2e_all = True
                say(f"apps/{app}: no e2e impact-map entry -> all specs (fail-closed)")
            elif entry == "all":
                e2e_all = True
                say(f"apps/{app}: mapped 'all' -> all specs")
            elif entry == "none":
                e2e_touched = True
            else:
                e2e_specs.update(entry)
                e2e_touched = True
                say(f"apps/{app} -> e2e {', '.join(entry)}")

    if e2e_all:
        plan.e2e_kind = "all"
        plan.e2e_specs = []
    elif e2e_specs or e2e_touched:
        plan.e2e_kind = "specs"
        plan.e2e_specs = sorted({SMOKE_SPEC, *e2e_specs})
    return plan


# ---------------------------------------------------------------------------
# Repo integration (everything below touches git / the filesystem).
# ---------------------------------------------------------------------------


def _git(*args):
    result = subprocess.run(
        ["git", *args], cwd=REPO_ROOT, check=True, capture_output=True, text=True
    )
    return [line for line in result.stdout.splitlines() if line.strip()]


def git_changed_files(base):
    """Tracked changes vs `base` plus untracked (not-ignored) files."""
    return sorted(
        set(_git("diff", "--name-only", base))
        | set(_git("ls-files", "--others", "--exclude-standard"))
    )


def list_backend_apps():
    return sorted(
        p.name for p in APPS_DIR.iterdir() if p.is_dir() and (p / "__init__.py").exists()
    )


def build_import_graph(apps):
    """importers[X] = apps whose .py files reference `apps.X` (imports or strings)."""
    importers = {app: set() for app in apps}
    ref_re = re.compile(r"apps\.([a-z_][a-z0-9_]*)")
    for app in apps:
        for py in (APPS_DIR / app).rglob("*.py"):
            try:
                text = py.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for target in set(ref_re.findall(text)):
                if target != app and target in importers:
                    importers[target].add(app)
    return importers


def load_impact_map():
    if not IMPACT_MAP_PATH.exists():
        return {}
    return json.loads(IMPACT_MAP_PATH.read_text(encoding="utf-8"))


def list_spec_stems():
    return sorted(p.name.removesuffix(".spec.ts") for p in SPECS_DIR.glob("*.spec.ts"))


def _has_tests(app):
    return (APPS_DIR / app / "tests").is_dir() or (APPS_DIR / app / "tests.py").exists()


def _run(cmd, cwd, dry):
    print(f"$ ({cwd.relative_to(REPO_ROOT) if cwd != REPO_ROOT else '.'}) {' '.join(cmd)}")
    if dry:
        return 0
    return subprocess.run(cmd, cwd=cwd).returncode


def execute(plan, mode, base, dry):
    rc = 0
    if mode == "backend":
        if plan.backend_kind == "full-create-db":
            rc = max(rc, _run(
                ["docker", "compose", "exec", "django", "pytest", "-n", "auto", "--create-db"],
                REPO_ROOT, dry))
        elif plan.backend_kind == "full":
            rc = max(rc, _run(
                ["docker", "compose", "exec", "django", "pytest", "-n", "auto"],
                REPO_ROOT, dry))
        elif plan.backend_kind == "apps":
            testable = [a for a in plan.backend_apps if _has_tests(a)]
            skipped = [a for a in plan.backend_apps if not _has_tests(a)]
            if skipped:
                print(f"note: no tests dir in: {', '.join(skipped)}")
            if testable:
                cmd = ["docker", "compose", "exec", "django", "pytest",
                       *[f"apps/{a}" for a in testable], "-n", "auto"]
                rc = max(rc, _run(cmd, REPO_ROOT, dry))
        else:
            print("backend: nothing selected")

        if plan.vitest_kind == "changed":
            flag = "--changed" if base == "HEAD" else f"--changed={base}"
            rc = max(rc, _run(["npx", "vitest", "run", flag],
                              REPO_ROOT / "frontend-customer", dry))
        elif plan.vitest_kind == "full":
            rc = max(rc, _run(["npx", "vitest", "run"],
                              REPO_ROOT / "frontend-customer", dry))

        if plan.e2e_kind != "none":
            what = "all specs" if plan.e2e_kind == "all" else ", ".join(plan.e2e_specs)
            print(f"e2e impact ({what}) — run `make e2e-changed` with the dev stack up")

    elif mode == "e2e":
        if plan.e2e_kind == "none":
            print("e2e: nothing selected")
            return rc
        for pre in (["npm", "install", "--silent"],
                    ["npx", "playwright", "install", "chromium"]):
            rc = max(rc, _run(pre, REPO_ROOT / "e2e", dry))
            if rc:
                return rc
        cmd = ["npx", "playwright", "test"]
        if plan.e2e_kind == "specs":
            cmd += plan.e2e_specs
        rc = max(rc, _run(cmd, REPO_ROOT / "e2e", dry))
    return rc


# ---------------------------------------------------------------------------
# Self-test fixtures — pure cases against build_plan.
# ---------------------------------------------------------------------------

_FIX_APPS = ["billing", "community", "courses", "tenant_config", "usage"]
_FIX_IMPORTERS = {
    "billing": {"courses"},
    "community": {"tenant_config"},
    "courses": {"billing"},
    "tenant_config": set(),
    "usage": set(),
}
_FIX_MAP = {
    "backend": {
        "billing": ["20-stripe-platform"],
        "community": ["15-community"],
        "usage": "none",
        # "courses" deliberately unmapped -> all specs (fail-closed case)
    },
    "frontend-customer": {
        "src/lib/logo": ["15-logo-studio"],
        "src/app/sw.ts": ["08-pwa"],
    },
    "frontend-main": ["01-signup-onboarding"],
    "manual": ["90-logo-eval"],
}

_CASES = [
    ("empty diff", [], dict(backend_kind="none", vitest_kind="none", e2e_kind="none")),
    (
        "leaf app + importer expansion + e2e map",
        ["backend/apps/community/views.py"],
        dict(
            backend_kind="apps",
            backend_apps=["community", "tenant_config"],
            e2e_kind="specs",
            e2e_specs=["00-smoke", "15-community"],
            vitest_kind="none",
        ),
    ),
    (
        "wide trigger -> full backend + all e2e",
        ["backend/apps/core/signals.py"],
        dict(backend_kind="full", e2e_kind="all"),
    ),
    (
        "migrations -> full with create-db",
        ["backend/apps/billing/migrations/0009_x.py"],
        dict(
            backend_kind="full-create-db",
            e2e_kind="specs",
            e2e_specs=["00-smoke", "20-stripe-platform"],
        ),
    ),
    (
        "unmapped app -> importers still expand, e2e fail-closed",
        ["backend/apps/courses/models.py"],
        dict(backend_kind="apps", backend_apps=["billing", "courses"], e2e_kind="all"),
    ),
    (
        "explicit 'none' app -> smoke only",
        ["backend/apps/usage/models.py"],
        dict(backend_kind="apps", backend_apps=["usage"], e2e_kind="specs", e2e_specs=["00-smoke"]),
    ),
    (
        "changed spec selects itself",
        ["e2e/specs/15-community.spec.ts"],
        dict(backend_kind="none", e2e_kind="specs", e2e_specs=["00-smoke", "15-community"]),
    ),
    (
        "e2e infra -> all specs",
        ["e2e/helpers/auth.ts"],
        dict(e2e_kind="all"),
    ),
    (
        "frontend-customer mapped prefix",
        ["frontend-customer/src/lib/logo/composer.ts"],
        dict(vitest_kind="changed", e2e_kind="specs", e2e_specs=["00-smoke", "15-logo-studio"]),
    ),
    (
        "frontend-customer unmapped path -> all specs",
        ["frontend-customer/src/lib/tenant.ts"],
        dict(vitest_kind="changed", e2e_kind="all"),
    ),
    (
        "packages/shared -> full vitest + all e2e",
        ["packages/shared/tokens.ts"],
        dict(vitest_kind="full", e2e_kind="all"),
    ),
    (
        "frontend-main -> its mapped specs",
        ["frontend-main/src/app/signup/page.tsx"],
        dict(e2e_kind="specs", e2e_specs=["00-smoke", "01-signup-onboarding"]),
    ),
    (
        "ignored paths -> nothing",
        ["docs/PRODUCT.md", "community-429-error-state.png", "Makefile", "tools/flowmap/server.js"],
        dict(backend_kind="none", vitest_kind="none", e2e_kind="none"),
    ),
    (
        "unknown root file -> fail closed on both",
        ["Caddyfile"],
        dict(backend_kind="full", e2e_kind="all"),
    ),
    (
        "compose file -> fail closed on both",
        ["docker-compose.prod.yml"],
        dict(backend_kind="full", e2e_kind="all"),
    ),
]


def run_self_tests():
    failures = 0
    for name, changed, expected in _CASES:
        plan = build_plan(changed, _FIX_IMPORTERS, _FIX_APPS, _FIX_MAP)
        for attr, want in expected.items():
            got = getattr(plan, attr)
            if got != want:
                print(f"FAIL {name}: {attr} = {got!r}, want {want!r}")
                failures += 1
                break
        else:
            print(f"ok   {name}")

    # Repo-level checks (real filesystem, still fast).
    apps = list_backend_apps()
    graph = build_import_graph(apps)
    if "billing" not in graph.get("courses", set()):
        print("FAIL repo graph: expected apps/billing to reference apps.courses")
        failures += 1
    else:
        print("ok   repo graph: billing -> courses edge present")

    impact_map = load_impact_map()
    if not impact_map:
        print("FAIL impact map: e2e/impact-map.json missing or empty")
        failures += 1
    else:
        referenced = {SMOKE_SPEC, *impact_map.get("manual", []), *impact_map.get("frontend-main", [])}
        for section in ("backend", "frontend-customer"):
            for value in impact_map.get(section, {}).values():
                if isinstance(value, list):
                    referenced.update(value)
        stems = set(list_spec_stems())
        unmapped = sorted(stems - referenced)
        ghosts = sorted(referenced - stems)
        if unmapped:
            print(f"FAIL impact map: specs never referenced: {', '.join(unmapped)} "
                  "(add them to e2e/impact-map.json or its 'manual' list)")
            failures += 1
        if ghosts:
            print(f"FAIL impact map: references to nonexistent specs: {', '.join(ghosts)}")
            failures += 1
        if not unmapped and not ghosts:
            print(f"ok   impact map: all {len(stems)} specs referenced")

    if failures:
        print(f"{failures} self-test case(s) failed")
    return 1 if failures else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["backend", "e2e"], default="backend")
    parser.add_argument("--base", default="HEAD")
    parser.add_argument("--plan", action="store_true", help="print selection, run nothing")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return run_self_tests()

    changed = git_changed_files(args.base)
    if not changed:
        print(f"No changes vs {args.base} — nothing to run. "
              "Try BASE=main (or another ref), or `make test` for the full suite.")
        return 0

    apps = list_backend_apps()
    plan = build_plan(changed, build_import_graph(apps), apps, load_impact_map())

    print(f"Diff vs {args.base}: {len(changed)} changed file(s)")
    for reason in plan.reasons:
        print(f"  {reason}")
    print(f"plan: backend={plan.backend_kind}"
          f"{' [' + ' '.join(plan.backend_apps) + ']' if plan.backend_apps else ''}"
          f" vitest={plan.vitest_kind} e2e={plan.e2e_kind}"
          f"{' [' + ' '.join(plan.e2e_specs) + ']' if plan.e2e_specs else ''}")
    return execute(plan, args.mode, args.base, dry=args.plan)


if __name__ == "__main__":
    sys.exit(main())
