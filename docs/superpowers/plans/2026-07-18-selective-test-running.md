# Selective Test Running Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `make test-changed` / `make e2e-changed` run only the tests affected by the current git diff, with fail-closed selection and a full-suite preflight on `make deploy`.

**Architecture:** One host-side stdlib-Python script (`scripts/select_tests.py`) with a pure `build_plan()` core (unit-tested via embedded `--self-test` fixtures) and a thin integration shell (git diff, live import-graph grep, subprocess runners). E2e selection is data-driven by a checked-in `e2e/impact-map.json`. Spec: `docs/superpowers/specs/2026-07-18-selective-test-running-design.md`.

**Tech Stack:** Python 3 stdlib only (host), GNU make, pytest/xdist in the django container, vitest 4 (`--changed`), Playwright CLI.

## Global Constraints

- `scripts/select_tests.py` uses **Python 3 stdlib only** — no pip installs, runs on the host like `scripts/mirror_demo_assets.py`.
- **Fail-closed everywhere:** any path the selector does not recognize widens the run (full backend + all e2e), never narrows it.
- Never run the full backend or e2e suite as a verification step in this plan — always verify selection with `--plan` / `PLAN=1` (the working tree currently touches `apps/core`, so a real run would be the full 1,452-test suite).
- `pre-commit run --all-files` must stay green after every task (repo rule: zero warnings).
- Do not create any `.md` files beyond this plan and the already-written spec.
- The e2e suite is invoked exactly like existing targets: `cd e2e && npm install --silent && npx playwright install chromium && npx playwright test …`.
- Spec names are the `NN-name` stems of `e2e/specs/*.spec.ts` (e.g. `15-community`); Playwright treats them as filename substrings.

---

### Task 1: Selector core — pure `build_plan()` + embedded self-test

**Files:**
- Create: `scripts/select_tests.py`

**Interfaces:**
- Produces: `Plan` dataclass with fields `backend_kind: str` (`"none"|"apps"|"full"|"full-create-db"`), `backend_apps: list[str]` (sorted, only when `"apps"`), `vitest_kind: str` (`"none"|"changed"|"full"`), `e2e_kind: str` (`"none"|"specs"|"all"`), `e2e_specs: list[str]` (sorted stems, only when `"specs"`), `reasons: list[str]`.
- Produces: `build_plan(changed_files, importers, backend_apps, impact_map) -> Plan` — pure, no filesystem/git access. `importers` maps app → set of apps referencing it; `impact_map` is the parsed JSON dict.
- Produces: `run_self_tests() -> int` (0 = pass) behind CLI flag `--self-test`.

- [ ] **Step 1: Write the script with fixtures + a stub `build_plan` that raises**

Create `scripts/select_tests.py` with this exact content (the self-test cases are the failing tests; `build_plan` is a stub):

```python
#!/usr/bin/env python3
"""Select and run the tests affected by the current git diff.

Design: docs/superpowers/specs/2026-07-18-selective-test-running-design.md
Invoked via `make test-changed` / `make e2e-changed`.

Usage:
    python3 scripts/select_tests.py [--mode backend|e2e] [--base REF] [--plan] [--self-test]
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field

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
    raise NotImplementedError


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
    raise SystemExit("integration not implemented yet (Task 2)")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run the self-test to verify it fails**

Run: `python3 scripts/select_tests.py --self-test`
Expected: crash with `NotImplementedError` (the stub) — confirms the fixtures execute.

- [ ] **Step 3: Implement `build_plan`**

Replace the stub `build_plan` with:

```python
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
```

Note: `path.startswith(IGNORED_PREFIXES)` works because `str.startswith` accepts a tuple. The migrations branch intentionally still falls through to app extraction so the e2e map applies (`full-create-db` beats `apps` at the end).

- [ ] **Step 4: Run the self-test to verify it passes**

Run: `python3 scripts/select_tests.py --self-test`
Expected: 15 `ok` lines, exit code 0 (`echo $?` → `0`).

- [ ] **Step 5: Commit**

```bash
git add scripts/select_tests.py
git commit -m "feat(tooling): selective test selector core (build_plan + self-test)"
```

---

### Task 2: Repo integration — git diff, import graph, runners, CLI

**Files:**
- Modify: `scripts/select_tests.py` (add integration layer; replace `main`)

**Interfaces:**
- Consumes: `build_plan`, `Plan`, `run_self_tests` from Task 1.
- Produces: CLI used by the Makefile: `python3 scripts/select_tests.py --mode backend|e2e [--base REF] [--plan] [--self-test]`. Exit code = max exit code of executed commands.
- Produces: `build_import_graph(apps) -> dict[str, set[str]]`, `git_changed_files(base) -> list[str]`, `list_backend_apps() -> list[str]`, `load_impact_map() -> dict`, `list_spec_stems() -> list[str]` (used by Task 3's completeness check).

- [ ] **Step 1: Add the integration layer**

Add to the imports at the top of the file:

```python
import json
import re
import subprocess
from pathlib import Path
```

Insert after the constants block (before `@dataclass`):

```python
REPO_ROOT = Path(__file__).resolve().parent.parent
APPS_DIR = REPO_ROOT / "backend" / "apps"
SPECS_DIR = REPO_ROOT / "e2e" / "specs"
IMPACT_MAP_PATH = REPO_ROOT / "e2e" / "impact-map.json"
```

Insert after `build_plan` (before the self-test fixtures):

```python
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
```

Replace the whole `main` function with:

```python
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
```

- [ ] **Step 2: Add a repo-level assertion to the self-test**

The import graph is live data — pin one known edge so regressions in the grep surface here. Append to `run_self_tests`, just before the `if failures:` line:

```python
    # Repo-level checks (real filesystem, still fast).
    apps = list_backend_apps()
    graph = build_import_graph(apps)
    if "billing" not in graph.get("courses", set()):
        print("FAIL repo graph: expected apps/billing to reference apps.courses")
        failures += 1
    else:
        print("ok   repo graph: billing -> courses edge present")
```

- [ ] **Step 3: Run the self-test**

Run: `python3 scripts/select_tests.py --self-test`
Expected: 15 `ok` case lines + `ok   repo graph: …`, exit 0.

- [ ] **Step 4: Verify selection against the real (currently dirty) working tree**

Run: `python3 scripts/select_tests.py --plan`
Expected: `backend=full` (the tree touches `backend/apps/core/…` — a wide trigger), `vitest=changed` (frontend-customer files are modified), `e2e=all`, and the printed commands are prefixed with `$` but nothing executes.

Run: `python3 scripts/select_tests.py --mode e2e --plan`
Expected: same plan lines; the printed Playwright command is `npx playwright test` with no spec args (all).

- [ ] **Step 5: Verify the leaf-app path with a synthetic diff (no real run)**

Sanity-check selection narrowness in isolation:

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, "scripts")
from select_tests import build_plan, build_import_graph, list_backend_apps, load_impact_map
apps = list_backend_apps()
plan = build_plan(["backend/apps/community/views.py"], build_import_graph(apps), apps, load_impact_map())
print("apps:", plan.backend_apps)
EOF
```

Expected: `apps: ['community', 'tenant_config']` (community's only importer today; if the live graph has picked up another legitimate importer, that appearing here is correct behavior — verify it references `apps.community` before assuming a bug).

- [ ] **Step 6: Commit**

```bash
git add scripts/select_tests.py
git commit -m "feat(tooling): wire test selector to git diff, import graph, and runners"
```

---

### Task 3: `e2e/impact-map.json` + map completeness check

**Files:**
- Create: `e2e/impact-map.json`
- Modify: `scripts/select_tests.py` (extend `run_self_tests`)

**Interfaces:**
- Consumes: `load_impact_map()`, `list_spec_stems()`, `SMOKE_SPEC` from Task 2.
- Produces: the map schema — top-level keys `backend` (app → list | `"none"` | `"all"`), `frontend-customer` (src-path prefix → same), `frontend-main` (list), `packages/shared` is NOT a key (handled in code), `manual` (list of stems excluded from selection, chosen only when their own file changes).

- [ ] **Step 1: Write the impact map**

Create `e2e/impact-map.json` (derived from what each spec navigates to — e.g. `15-community` drives `/admin/community` + `/community`, `18-curated-library-admin` drives the frontend-main superadmin panel):

```json
{
  "backend": {
    "billing": ["20-stripe-platform", "21-stripe-marketplace"],
    "blog": "none",
    "community": ["15-community"],
    "courses": ["02-courses"],
    "demo_seed": "none",
    "domains": "none",
    "downloads": ["12-downloads"],
    "email_campaigns": "none",
    "filters": ["02-courses"],
    "live": ["03-calendar", "04-live-class", "13-events-page"],
    "mailbox": ["07-mailbox"],
    "media": ["05-media"],
    "notifications": ["06-announcements"],
    "platform_email": "none",
    "tags": ["02-courses"],
    "tenant_config": [
      "09-builder",
      "14-navbar-layouts",
      "15-logo-studio",
      "16-site-assistant",
      "17-logo-curated-library",
      "18-curated-library-admin",
      "22-assistant-takeover"
    ],
    "usage": "none"
  },
  "frontend-customer": {
    "src/app/(student)/community": ["15-community"],
    "src/app/(student)/learn": ["02-courses"],
    "src/app/live": ["04-live-class"],
    "src/app/manifest.ts": ["08-pwa"],
    "src/app/sw.ts": ["08-pwa"],
    "src/components/assistant": ["16-site-assistant", "22-assistant-takeover"],
    "src/components/blocks": ["09-builder", "14-navbar-layouts"],
    "src/components/community": ["15-community"],
    "src/components/live": ["04-live-class"],
    "src/components/logo": [
      "15-logo-studio",
      "17-logo-curated-library",
      "18-curated-library-admin",
      "23-wizard-ai-logo"
    ],
    "src/lib/assistant.ts": ["16-site-assistant", "22-assistant-takeover"],
    "src/lib/blocks": ["09-builder", "14-navbar-layouts"],
    "src/lib/community": ["15-community"],
    "src/lib/logo": [
      "15-logo-studio",
      "17-logo-curated-library",
      "18-curated-library-admin",
      "23-wizard-ai-logo"
    ],
    "src/lib/mailbox.ts": ["07-mailbox"],
    "src/lib/navbar.ts": ["14-navbar-layouts"]
  },
  "frontend-main": [
    "01-signup-onboarding",
    "10-impersonation",
    "11-login-code",
    "18-curated-library-admin",
    "19-wizard-recovery",
    "22-assistant-takeover",
    "23-wizard-ai-logo"
  ],
  "manual": ["90-logo-eval"]
}
```

Notes locked into the data: `core`/`accounts`/`adminkit` never consult this map (wide triggers → all). `frontend-main` includes the superadmin-panel specs (`10`, `18`, `22`) because those specs drive `MAIN/admin/…` pages. Stripe specs keep their existing `STRIPE_E2E` auto-skip. Unlisted frontend-customer paths fall to all specs by rule, not by map entry.

- [ ] **Step 2: Add the completeness check to the self-test**

Every spec on disk must be reachable through the map (or explicitly manual/smoke) so new specs can't be silently unmapped. Append to `run_self_tests`, after the repo-graph check:

```python
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
```

- [ ] **Step 3: Run the self-test**

Run: `python3 scripts/select_tests.py --self-test`
Expected: all `ok` lines including `ok   impact map: all 26 specs referenced`, exit 0. If a spec was added/renamed since this plan was written, the FAIL message names it — fix the map, not the check.

- [ ] **Step 4: Verify e2e selection end-to-end (dry)**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, "scripts")
from select_tests import build_plan, build_import_graph, list_backend_apps, load_impact_map
apps = list_backend_apps()
plan = build_plan(["backend/apps/community/views.py"], build_import_graph(apps), apps, load_impact_map())
print("e2e:", plan.e2e_kind, plan.e2e_specs)
EOF
```

Expected: `e2e: specs ['00-smoke', '15-community']`

- [ ] **Step 5: Commit**

```bash
git add e2e/impact-map.json scripts/select_tests.py
git commit -m "feat(e2e): impact map for selective spec runs + completeness self-test"
```

---

### Task 4: Makefile targets + deploy preflight + lint wiring

**Files:**
- Modify: `Makefile` (`.PHONY` line, `help` greps, new targets after `test-app` and after `e2e-spec`, `deploy`, `lint`)

**Interfaces:**
- Consumes: the Task 2 CLI (`--mode`, `--base`, `--plan`, `--self-test`).
- Produces: `make test-changed [BASE=<ref>] [PLAN=1]`, `make e2e-changed [BASE=<ref>] [PLAN=1]`, `make deploy [SKIP_TESTS=1]`, selector self-test inside `make lint`.

- [ ] **Step 1: Edit the Makefile**

`.PHONY` (first line) — append the two targets: change `… flowmap flowmap-register flowmap-show e2e e2e-stripe e2e-spec` to `… flowmap flowmap-register flowmap-show e2e e2e-stripe e2e-spec test-changed e2e-changed`.

`help` Quality grep — change
`'^(test|test-backend|test-app|test-frontend|test-fresh|typecheck|typecheck-backend|lint|format):.*?## .*$$'`
to
`'^(test|test-backend|test-app|test-changed|test-frontend|test-fresh|typecheck|typecheck-backend|lint|format):.*?## .*$$'`

`help` E2E grep — change `'^(e2e|e2e-stripe|e2e-spec):.*?## .*$$'` to `'^(e2e|e2e-stripe|e2e-spec|e2e-changed):.*?## .*$$'`

After the `test-app` target, add:

```make
test-changed: ## Run only tests affected by the git diff (BASE=<ref> to widen, PLAN=1 to preview)
	python3 scripts/select_tests.py --mode backend $(if $(BASE),--base $(BASE),) $(if $(PLAN),--plan,)
```

After the `e2e-spec` target, add:

```make
e2e-changed: ## Run only e2e specs affected by the diff, via e2e/impact-map.json (BASE=<ref>, PLAN=1)
	python3 scripts/select_tests.py --mode e2e $(if $(BASE),--base $(BASE),) $(if $(PLAN),--plan,)
```

Replace the `deploy` target:

```make
deploy: ## Deploy contentor to the home server (full backend tests first; SKIP_TESTS=1 to skip)
	@if [ -z "$(SKIP_TESTS)" ]; then $(MAKE) test; else echo "skipping test preflight (SKIP_TESTS=1)"; fi
	cd ~/ws/home-server && ./deploy.sh contentor
```

In the `lint` target, add the self-test line between `check-i18n` and `typecheck`:

```make
lint: ## Run all linters via pre-commit, then i18n parity, selector self-test, and TS typecheck
	pre-commit run --all-files
	@$(MAKE) check-i18n
	python3 scripts/select_tests.py --self-test
	@$(MAKE) typecheck
```

- [ ] **Step 2: Verify help output and target plumbing**

Run: `make help | grep -A1 changed`
Expected: both `test-changed` and `e2e-changed` listed with their descriptions (Quality and E2E groups).

Run: `make test-changed PLAN=1`
Expected: the Task 2 Step 4 plan output (backend=full on the current dirty tree), exit 0, nothing executed.

Run: `make e2e-changed PLAN=1 BASE=HEAD`
Expected: same selection, Playwright command printed dry.

- [ ] **Step 3: Verify deploy preflight wiring WITHOUT deploying or running tests**

Run: `make deploy --dry-run SKIP_TESTS=1 | head -3`
Expected: the echo line about skipping preflight, then the `cd ~/ws/home-server && ./deploy.sh contentor` line. (`--dry-run` prints recipes without executing — nothing deploys.)

Run: `make deploy --dry-run | head -3`
Expected: shows the `$(MAKE) test` branch will run (the if-block with `make test` inside), then the deploy line.

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "build: make test-changed / e2e-changed + deploy test preflight + selector self-test in lint"
```

---

### Task 5: Documentation updates (the references)

**Files:**
- Modify: `CLAUDE.md` (Commands block; "Local fakes + e2e" paragraph; Home-server deploy section)
- Modify: `docs/REFERENCE.md` (§11 Dev "Useful:" line, currently around line 571)

**Interfaces:**
- Consumes: final target names/flags from Task 4 — `make test-changed [BASE= PLAN=1]`, `make e2e-changed`, `SKIP_TESTS=1`.

- [ ] **Step 1: CLAUDE.md Commands block**

In the `## Commands` code block, insert directly under the `make test-app APP=billing   # one backend app's tests` line:

```
make test-changed      # only tests affected by the git diff (BASE=<ref>, PLAN=1 to preview) — scripts/select_tests.py
```

and under the `make e2e-spec SPEC=04-live-class  # one Playwright spec` line:

```
make e2e-changed       # only e2e specs affected by the diff (e2e/impact-map.json; 00-smoke always runs)
```

- [ ] **Step 2: CLAUDE.md e2e + deploy sections**

At the end of the "Local fakes + e2e" paragraph (after the sentence about `make e2e-stripe`), append:

```
`make e2e-changed` runs only the specs mapped to the current diff via `e2e/impact-map.json` — fail-closed (unmapped areas run everything), `00-smoke` always included; the selector self-test in `make lint` fails if a spec file has no map entry.
```

In the "Home-server deploy" section, change the deploy bullet from

```
- **Deploy:** from the Mac, `cd ~/ws/home-server && ./deploy.sh contentor`
  (rsync + build + up + health). Tunnel ingress: `./deploy.sh edge`. The repo is
  reached via a symlink at `~/ws/projects-active/home-server/contentor`.
```

to

```
- **Deploy:** from the Mac, `make deploy` — runs the full backend suite first
  (`SKIP_TESTS=1` to bypass), then `cd ~/ws/home-server && ./deploy.sh contentor`
  (rsync + build + up + health). Tunnel ingress: `./deploy.sh edge`. The repo is
  reached via a symlink at `~/ws/projects-active/home-server/contentor`.
```

- [ ] **Step 3: docs/REFERENCE.md §11 Dev**

Change the "Useful:" line (around `docs/REFERENCE.md:571`) from

```
`make seed`, `make test`, `make lint`, `make format`, `make shell`, `make health-check`.
```

to

```
`make seed`, `make test`, `make test-changed` / `make e2e-changed` (diff-scoped runs
via `scripts/select_tests.py` + `e2e/impact-map.json`), `make lint`, `make format`,
`make shell`, `make health-check`.
```

- [ ] **Step 4: Verify docs and lint**

Run: `grep -n "test-changed" CLAUDE.md docs/REFERENCE.md Makefile | wc -l`
Expected: at least 4 matches (CLAUDE.md, REFERENCE.md, two Makefile spots).

Run: `pre-commit run --all-files`
Expected: all hooks pass (md files are touched — trailing-whitespace/end-of-file hooks must stay green).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/REFERENCE.md
git commit -m "docs: reference make test-changed / e2e-changed and deploy preflight"
```

---

## Post-plan verification (manual, once)

After all tasks: `make lint` must pass end-to-end (now includes the selector self-test). Then exercise one real scoped run on a quiet tree — e.g. after committing current work, touch a comment in `backend/apps/usage/models.py` and confirm `make test-changed` runs only `apps/usage` (~seconds) and reports `e2e impact (00-smoke)`. Revert the touch afterwards.
