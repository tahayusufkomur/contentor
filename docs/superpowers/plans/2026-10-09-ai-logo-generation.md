# AI Logo Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three complete, on-brand logo candidates are generated on the Agent Container hub in the background while a coach answers the setup interview, vectorized and ranked by us, and offered on the logo card for one tap.

**Architecture:** A Celery task fired by the interview's existing milestone batch builds a brief from the interview answers and the chosen site style, dispatches three parallel hub image runs, pulls the PNGs back, traces them to palette-role vectors, gates them deterministically plus one vision read-back, ranks them with one comparative vision call, and stores `LogoCandidate` rows. The logo card reads the current batch; picking a candidate writes the tenant logo, icon and a recipe with a new `generated` mark kind that the shared renderer draws with role colours.

**Tech Stack:** Django 5.1 + Celery (backend), vtracer + Pillow (vectorizing), the Agent Container hub via `apps.core.ai` (Gemini 3.8 Flash runs the image subagent, Gemini 3.1 Pro reads and judges), Next.js 14 + `packages/shared` logo renderer (frontend), pytest / vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-ai-logo-generation-design.md`

## Global Constraints

- Hub image runs use the plain prompt shape that succeeded 5/5: the brief text, then "Save the generated image as `<out_path>` relative to the current working directory. Then reply with ONLY a JSON object …". No `<brief>` wrapping, no subagent `Model=pro`.
- The brand name is the only text in the generated image. No tagline in the image.
- Vector roles are exactly `background, surface, primary, accent, ink, muted`; `background` paths are dropped; caps ≤ 400 paths and ≤ 300 000 chars total.
- Path `d` strings must satisfy `logo_recipe._PATH_D_RE` (`^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$`): commands `M L C Q Z`, ≤ 2 decimals, no scientific notation.
- `LOGO_GEN_ENABLED` defaults to `AI_PROVIDER == "agentc"`; off means no due item fires and the card is unchanged. E2e runs `AI_PROVIDER=cli`, so e2e behaviour is unchanged.
- One batch in flight per tenant; a `building` batch older than 15 minutes counts as failed.
- Public endpoints keep `IsCoachOrOwner` + `_setup_over()` like their siblings in `setup_flow_views.py`.
- KEEP IN SYNC pairs change in one commit: `logo_recipe.py` ↔ `packages/shared/src/logo/{types,migrate}.ts`; parity fixtures on both sides.
- `packages/shared` and `apps/core` are widely shared: run GitNexus `impact` before editing `validate_recipe`, `MarkContent`, `structured`, `_agentc_run`, and `detect_changes` before each commit that touches them.
- Never raise the heap caps or `mem_limit`s in `docker-compose.yml`. One heavy job at a time.
- Never create new `.md` files beyond this plan and its spec.

## Review Focus

1. A brand name with diacritics or punctuation ("Görkem Hancı Yoga", "Shift-Left") must pass the read-back gate when the image shows it correctly, and fail when a letter is missing. Test: Task 4 normalisation cases.
2. A wordmark-only candidate has no separate mark; `icon_crop` must return `None` and the apply step must leave `config.icon` unset so the favicon falls back to initials. Test: Task 3 (`icon_crop` on a wordmark fixture) and Task 8 (apply with `icon=None`).
3. The coach changes the style after a batch is ready; the old candidates are in the wrong palette. `apply_style` must re-dispatch and the card must show `building` again while keeping the old batch readable until the new one lands. Test: Task 8.
4. A hub run that times out on one account must not lose the other two candidates, and a batch with zero survivors must retry once, then mark `failed` with the card falling back to curated. Test: Task 6.
5. A `gen:<id>` pick for a candidate from another tenant or a rejected candidate must be refused with `ChoiceError("unknown_logo")`, never applied. Test: Task 8.

---

### Task 1: Hub image, vision and file runs in `apps.core.ai` + settings

**Files:**
- Modify: `backend/apps/core/ai.py:278-410` (agentc section)
- Modify: `backend/config/settings/base.py:282-293` (AGENTC_* block)
- Modify: `.env.prod.example:123-127`
- Modify: `docker-compose.yml:186-189` (celery-worker volumes)
- Test: `backend/apps/core/tests/test_ai_agentc.py`

**Interfaces:**
- Consumes: existing `_agentc_create`, `_agentc_cancel`, `_agentc_used_tool`, `AiError`.
- Produces:
  - `agentc_image_run(brief: str, out_path: str, *, label: str, timeout_seconds: int | None = None) -> str` → hub run id (raises `AiError`).
  - `agentc_vision_run(prompt: str, *, label: str, timeout_seconds: int | None = None) -> str` → resultText, tools allowed, model `settings.AGENTC_PRO_MODEL`.
  - `agentc_run_file(run_id: str, path: str) -> bytes` (raises `AiError` when missing).
  - `structured(..., effort="max")` selects `AGENTC_PRO_MODEL` on agentc.
  - Settings: `LOGO_GEN_ENABLED`, `LOGO_GEN_CANDIDATES`, `AGENTC_PRO_MODEL`, `AGENTC_IMAGE_TIMEOUT_SECONDS`, `AGENTC_RUNS_DIR`.

- [ ] **Step 1: Run impact analysis**

Run: GitNexus `impact({target: "_agentc_run", direction: "upstream"})` and `impact({target: "_agentc_model", direction: "upstream"})`. Expected callers: `_agentc_structured`, `structured_stream` path. Report the blast radius in the task notes; proceed (LOW: the refactor keeps both signatures).

- [ ] **Step 2: Write the failing tests**

Append to `backend/apps/core/tests/test_ai_agentc.py`:

```python
def test_max_effort_runs_the_pro_model(hub, settings):
    settings.AGENTC_PRO_MODEL = "gemini-3.1-pro-high"
    _call(effort="max")
    assert hub.created[0]["model"] == "gemini-3.1-pro-high"


def test_image_run_allows_tools_and_returns_the_run_id(hub, settings, monkeypatch):
    settings.AGENTC_IMAGE_TIMEOUT_SECONDS = 420
    hub.results = ['{"file": "logo-candidates/t/b/cand_1.png", "image_model": "imagen-3"}']
    hub.events = ("tool", "text")  # the image subagent is a tool call
    run_id = ai.agentc_image_run("Design a logo.", "logo-candidates/t/b/cand_1.png", label="contentor:logo-gen")
    assert run_id == "run-1"
    body = hub.created[0]
    assert body["timeoutSec"] == 420 and body["priority"] == "interactive"
    assert "Save the generated image as logo-candidates/t/b/cand_1.png" in body["prompt"]
    assert body["prompt"].startswith("Use your image generation tool")


def test_vision_run_uses_the_pro_model_and_tolerates_tools(hub, settings):
    settings.AGENTC_PRO_MODEL = "gemini-3.1-pro-high"
    hub.results = ['{"ranking": [1]}']
    hub.events = ("tool", "text")
    assert ai.agentc_vision_run("Open a.png and rank.", label="contentor:logo-judge") == '{"ranking": [1]}'
    assert hub.created[0]["model"] == "gemini-3.1-pro-high"


def test_run_file_fetches_through_the_hub(hub, monkeypatch, settings):
    settings.AGENTC_RUNS_DIR = ""
    seen = {}

    def get(url, params=None, timeout=None, stream=False):
        seen["url"], seen["params"] = url, params
        resp = _Resp({}, status=200)
        resp.content = b"\x89PNG"
        return resp

    monkeypatch.setattr(ai.requests, "get", get)
    assert ai.agentc_run_file("run-1", "logo-candidates/t/b/cand_1.png") == b"\x89PNG"
    assert seen["url"].endswith("/runs/run-1/file") and seen["params"] == {"path": "logo-candidates/t/b/cand_1.png"}


def test_run_file_missing_raises(hub, monkeypatch, settings):
    settings.AGENTC_RUNS_DIR = ""
    monkeypatch.setattr(ai.requests, "get", lambda *a, **k: _Resp({"error": "no such file"}, status=404))
    with pytest.raises(ai.AiError):
        ai.agentc_run_file("run-1", "nope.png")


def test_run_file_reads_the_local_mount_when_configured(hub, settings, tmp_path, monkeypatch):
    settings.AGENTC_RUNS_DIR = str(tmp_path)
    monkeypatch.setattr(ai, "AGENTC_FILE_POLL_SECONDS", 0)
    (tmp_path / "x").mkdir()
    (tmp_path / "x" / "cand_1.png").write_bytes(b"\x89PNGlocal")
    assert ai.agentc_run_file("run-1", "x/cand_1.png") == b"\x89PNGlocal"
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_agentc.py -q -k "max_effort or image_run or vision_run or run_file"`
Expected: FAIL with `AttributeError: module 'apps.core.ai' has no attribute 'agentc_image_run'` (and the pro-model test failing on `gemini-3.8-flash-high`).

- [ ] **Step 4: Add the settings**

In `backend/config/settings/base.py`, directly after `AGENTC_TIMEOUT_SECONDS`:

```python
# Gemini 3.1 Pro on the hub: concepts, image read-back and the logo judge
# (core_ai.structured(effort="max") selects it on agentc).
AGENTC_PRO_MODEL = os.environ.get("AGENTC_PRO_MODEL", "gemini-3.1-pro-high")
# A hub image run waits on the agent's image subagent: 86-258 s measured
# 2026-10-09, so the budget is well above the text-run default.
AGENTC_IMAGE_TIMEOUT_SECONDS = int(os.environ.get("AGENTC_IMAGE_TIMEOUT_SECONDS", "420"))
# Dev only: a read-only mount of the synced studio directory, used instead of
# the hub's file route when set (empty in prod).
AGENTC_RUNS_DIR = os.environ.get("AGENTC_RUNS_DIR", "")

# --- Generated logo candidates (apps.tenant_config.logo_gen) ---
LOGO_GEN_ENABLED = os.environ.get("LOGO_GEN_ENABLED", "true" if AI_PROVIDER == "agentc" else "false").lower() == "true"
LOGO_GEN_CANDIDATES = int(os.environ.get("LOGO_GEN_CANDIDATES", "3"))
```

In `.env.prod.example` after the `AGENTC_TIMEOUT_SECONDS` line:

```
# AGENTC_PRO_MODEL=gemini-3.1-pro-high        # concepts, read-back, judge for generated logos
# AGENTC_IMAGE_TIMEOUT_SECONDS=420            # one hub image run
# LOGO_GEN_ENABLED=true                       # default: true when AI_PROVIDER=agentc
# LOGO_GEN_CANDIDATES=3
```

In `docker-compose.yml`, celery-worker `volumes` gains the dev mount, and `.env` (dev, not committed) gets `AGENTC_RUNS_DIR=/agent-studio-runs`:

```yaml
    volumes:
      - ./backend:/app/backend
      - ${HOME}/ws/agent-studio-runs:/agent-studio-runs:ro
```

- [ ] **Step 5: Implement the runs**

In `backend/apps/core/ai.py`, change `_agentc_model` and split `_agentc_run`:

```python
AGENTC_FILE_POLL_SECONDS = 2
_AGENTC_FILE_WAIT_SECONDS = 120


def _agentc_model(effort):
    """AGENTC_MODEL, its -low variant for effort="low" (interview turns, edits,
    picks), or AGENTC_PRO_MODEL for effort="max" (logo concepts, judge)."""
    if effort == "max":
        return settings.AGENTC_PRO_MODEL
    if effort == "low":
        return re.sub(r"-(medium|high)$", "-low", settings.AGENTC_MODEL)
    return settings.AGENTC_MODEL


def _agentc_execute(prompt, label, deadline, model):
    """Create one run and poll it to a terminal state -> the run dict of a
    succeeded run. Raises AiError on create/poll failure, deadline, or a
    non-succeeded state. Tool use is NOT checked here."""
    budget = max(int(deadline - time.monotonic()), 0)
    body = {
        "prompt": prompt,
        "cwd": settings.AGENTC_CWD,
        "model": model or settings.AGENTC_MODEL,
        "timeoutSec": budget,
        "worktree": False,
        "requireSyncFresh": False,
        "priority": "background" if label.startswith(_AGENTC_BACKGROUND_LABELS) else "interactive",
        "label": label,
    }
    run = _agentc_create(body)
    run_id = run.get("id")
    try:
        while run.get("state") not in _AGENTC_TERMINAL:
            if time.monotonic() >= deadline:
                raise AiError(f"agentc run {run_id} exceeded its {budget}s budget")
            time.sleep(AGENTC_POLL_SECONDS)
            resp = requests.get(_agentc_url(f"/runs/{run_id}"), timeout=_AGENTC_HTTP_TIMEOUT)
            resp.raise_for_status()
            run = resp.json()
    except (AiError, requests.RequestException, ValueError) as exc:
        _agentc_cancel(run_id)
        if isinstance(exc, AiError):
            raise
        raise AiError(f"agentc run {run_id} poll failed: {exc}") from exc
    if run["state"] != "succeeded":
        raise AiError(f"agentc run {run_id} {run['state']}: {str(run.get('error') or '')[:500]}")
    return run


def _agentc_run(prompt, label, deadline=None, model=None):
    """Run one prompt on the hub -> its resultText. Raises AiError on any
    failure, including a run whose event log shows a tool call (fail closed:
    an unreadable event log counts as a failure too). ``deadline`` is a
    time.monotonic() instant; default: AGENTC_TIMEOUT_SECONDS from now."""
    label = label or "contentor"
    if deadline is None:
        deadline = time.monotonic() + settings.AGENTC_TIMEOUT_SECONDS
    run = _agentc_execute(prompt, label, deadline, model)
    if _agentc_used_tool(run.get("id")):
        logger.warning("agentc run %s (label=%s) used a tool; output discarded", run.get("id"), label)
        raise AiError("agent used a tool")
    return run.get("resultText") or ""


_AGENTC_IMAGE_PROMPT = (
    "Use your image generation tool with the highest-quality image model available to you. {brief}\n\n"
    "Save the generated image as {out_path} relative to the current working directory. "
    'Then reply with ONLY a JSON object: {{"file": "{out_path}", "image_model": "<the model your tool used>"}}'
)


def agentc_image_run(brief, out_path, *, label, timeout_seconds=None):
    """One hub image run (the agent's image subagent draws and saves the
    file) -> the run id. Tools are the point here, so the tool check is
    skipped. The plain prompt shape is the one that succeeded 5/5 in the
    2026-10-09 spike; wrapping the brief or forcing the subagent model hung."""
    seconds = settings.AGENTC_IMAGE_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    run = _agentc_execute(_AGENTC_IMAGE_PROMPT.format(brief=brief, out_path=out_path), label, time.monotonic() + seconds, None)
    return str(run.get("id"))


def agentc_vision_run(prompt, *, label, timeout_seconds=None):
    """One hub text run on the Pro model that may open files with its viewer
    (image read-back, the logo judge) -> resultText. Tools allowed."""
    seconds = settings.AGENTC_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    run = _agentc_execute(prompt, label, time.monotonic() + seconds, settings.AGENTC_PRO_MODEL)
    return run.get("resultText") or ""


def agentc_run_file(run_id, path):
    """Bytes of ``path`` (relative to the run cwd) through the hub's file
    route; with AGENTC_RUNS_DIR set (dev), from the local mount instead,
    waiting for the directory sync. Raises AiError when missing."""
    if settings.AGENTC_RUNS_DIR:
        target = Path(settings.AGENTC_RUNS_DIR) / path
        waited = 0
        while waited <= _AGENTC_FILE_WAIT_SECONDS:
            if target.is_file() and target.stat().st_size > 0:
                return target.read_bytes()
            time.sleep(AGENTC_FILE_POLL_SECONDS)
            waited += AGENTC_FILE_POLL_SECONDS or 1
        raise AiError(f"agentc file {path} did not arrive in {settings.AGENTC_RUNS_DIR}")
    try:
        resp = requests.get(_agentc_url(f"/runs/{run_id}/file"), params={"path": path}, timeout=_AGENTC_HTTP_TIMEOUT * 6)
    except requests.RequestException as exc:
        raise AiError(f"agentc file fetch failed: {exc}") from exc
    if resp.status_code != 200:
        raise AiError(f"agentc file {path} for run {run_id}: {resp.status_code}")
    return resp.content
```

Add `from pathlib import Path` to the imports. Update the module docstring's agentc bullet: "No vision, no token streaming" → "Vision only through `agentc_vision_run` (file viewer); images only through `agentc_image_run`."

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_agentc.py -q`
Expected: PASS, all tests including the pre-existing ones (the `_agentc_run` contract is unchanged).

- [ ] **Step 7: Lint, detect changes, commit**

Run: `make lint` (pre-commit clean) and GitNexus `detect_changes()`; expected affected symbols only in `apps/core/ai.py`.

```bash
git add backend/apps/core/ai.py backend/apps/core/tests/test_ai_agentc.py backend/config/settings/base.py .env.prod.example docker-compose.yml
git commit -m "feat(ai): hub image, vision and file runs; effort=max selects the Pro model"
```

---

### Task 2: Palette colours and the logo brief

**Files:**
- Create: `backend/apps/tenant_config/logo_gen/__init__.py` (empty)
- Create: `backend/apps/tenant_config/logo_gen/color.py`
- Create: `backend/apps/tenant_config/logo_gen/brief.py`
- Test: `backend/apps/tenant_config/tests/test_logo_gen_brief.py`

**Interfaces:**
- Consumes: `apps.core.onboarding.ai_curate.CoachBrief.from_tenant`, `apps.tenant_config.sections.style/palettes`, `core_ai.structured`.
- Produces:
  - `color.oklch_to_hex(value: str) -> str` (`"oklch(0.48 0.1 12)"` → `"#8c4451"`-class result; clamped, lowercase).
  - `brief.LogoBrief` dataclass: `brand, business, mood, typography, palette: dict[str, str]` (roles `background, surface, primary, accent, ink, muted`), `style_id, palette_id`.
  - `brief.logo_brief(tenant, answers: dict) -> LogoBrief`.
  - `brief.Concept(BaseModel)`: `concept: str`, `archetype: Literal["mark_name", "wordmark", "emblem"]`.
  - `brief.concepts_for(brief: LogoBrief, *, count: int, avoid: list[str] = (), defects: list[str] = ()) -> list[Concept]` (never raises; falls back to defaults).
  - `brief.image_prompt(brief: LogoBrief, concept: Concept) -> str`.
  - `brief.ROLES = ("background", "surface", "primary", "accent", "ink", "muted")`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/tenant_config/tests/test_logo_gen_brief.py`:

```python
"""logo_gen.color + logo_gen.brief: palette conversion and the prompt."""

import pytest
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.tenant_config.logo_gen import brief as lb
from apps.tenant_config.logo_gen.color import oklch_to_hex


@pytest.mark.parametrize(
    "oklch, expected",
    [
        ("oklch(1 0 0)", "#ffffff"),
        ("oklch(0 0 0)", "#000000"),
        ("oklch(0.48 0.1 12)", "#8c4451"),  # atelier primary, checked against the spike
        ("oklch(0.17 0.014 160)", "#0f1a14"),  # terminal background
    ],
)
def test_oklch_to_hex(oklch, expected):
    assert oklch_to_hex(oklch) == expected


def test_oklch_to_hex_clamps_out_of_gamut():
    assert oklch_to_hex("oklch(0.83 0.22 148)") == "#4ade80"  # terminal primary (channels clamp to 0..255)


def _brief():
    return lb.LogoBrief(
        brand="Elara Face Yoga", business="face yoga and facial massage for women over 40",
        mood="A beauty atelier — blush paper, a light italic serif.", typography="a light high-contrast serif (Cormorant-like) paired with a clean sans",
        palette={"background": "#f8eeea", "surface": "#f2e2dd", "primary": "#8c4451", "accent": "#a6713a", "ink": "#3f2a2b", "muted": "#7a5f60"},
        style_id="atelier", palette_id="",
    )


def test_image_prompt_carries_every_brief_field_and_the_rules():
    text = lb.image_prompt(_brief(), lb.Concept(concept="a face in profile drawn in one line", archetype="mark_name"))
    for needle in ('"Elara Face Yoga" (spell it exactly)', "women over 40", "blush paper", "Cormorant-like",
                   "background #f8eeea", "primary #8c4451", "accent #a6713a", "text #3f2a2b", "Use only these colours",
                   "Mark concept: a face in profile drawn in one line", "a symbol or pictorial mark on the left",
                   "No words, letters or characters other than the brand name", "aspect ratio 4:3", "32 pixels"):
        assert needle in text
    assert "tagline" not in text.lower()


def test_image_prompt_archetypes_change_the_composition_sentence():
    word = lb.image_prompt(_brief(), lb.Concept(concept="x", archetype="wordmark"))
    emblem = lb.image_prompt(_brief(), lb.Concept(concept="x", archetype="emblem"))
    assert "the typography itself is the logo" in word
    assert "mark and name inside one enclosing shape" in emblem


@pytest.mark.django_db
def test_logo_brief_from_tenant_reads_the_style_palette(tenant_with_interview):
    tenant, answers = tenant_with_interview  # fixture: see conftest below
    b = lb.logo_brief(tenant, {**answers, "style": "atelier", "palette": ""})
    assert b.brand == tenant.name
    assert b.style_id == "atelier" and b.palette["primary"] == "#8c4451"
    assert set(b.palette) == set(lb.ROLES)
    assert "Cormorant" in b.typography and "atelier" in b.mood.lower()


@pytest.mark.django_db
def test_logo_brief_uses_the_palette_variant(tenant_with_interview):
    tenant, answers = tenant_with_interview
    own = lb.logo_brief(tenant, {**answers, "style": "atelier", "palette": ""})
    fig = lb.logo_brief(tenant, {**answers, "style": "atelier", "palette": "fig"})
    assert own.palette["primary"] != fig.palette["primary"] and fig.palette_id == "fig"


def test_concepts_for_returns_count_distinct_archetypes(monkeypatch):
    class _Out(BaseModel):
        concepts: list

    def fake_structured(**kw):
        assert kw["effort"] == "max"
        return kw["output_model"].model_validate({"concepts": [
            {"concept": "a lotus whose petals form a face", "archetype": "mark_name"},
            {"concept": "the name set in a thin serif with a hairline", "archetype": "wordmark"},
            {"concept": "a profile inside an arch", "archetype": "emblem"},
        ]}), 0, "gemini-3.1-pro-high"

    monkeypatch.setattr(core_ai, "structured", fake_structured)
    out = lb.concepts_for(_brief(), count=3)
    assert [c.archetype for c in out] == ["mark_name", "wordmark", "emblem"]


def test_concepts_for_falls_back_when_the_model_fails(monkeypatch):
    def boom(**kw):
        raise core_ai.AiError("down")

    monkeypatch.setattr(core_ai, "structured", boom)
    out = lb.concepts_for(_brief(), count=3, avoid=["x"], defects=["generic"])
    assert len(out) == 3 and {c.archetype for c in out} == {"mark_name", "wordmark", "emblem"}
```

Add to `backend/apps/tenant_config/tests/conftest.py` (create if absent, otherwise append):

```python
import pytest


@pytest.fixture
def tenant_with_interview(db):
    """A provisioned tenant with interview answers settled enough for a brief."""
    from apps.core.tests.factories import make_tenant  # existing helper; see apps/core/tests
    from apps.tenant_config import interview_brief

    tenant = make_tenant(name="Elara Face Yoga", slug="elara")
    answers = {"niche": "face_yoga", "subject": "face yoga", "description": "I teach women over 40 face yoga and facial massage.", "tone": "calm"}
    interview_brief.save_answers(tenant, answers)
    return tenant, answers
```

Before writing the fixture, check the real helper names: `grep -n "def make_tenant\|def create_tenant" backend/apps/core/tests/*.py backend/conftest.py` and `grep -n "def save_answers\|def answers_of" backend/apps/tenant_config/interview_brief.py`; use the existing names (the tenant factory used by `test_interview*.py` is the one to copy).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_brief.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.tenant_config.logo_gen'`.

- [ ] **Step 3: Implement `color.py`**

```python
"""oklch() -> sRGB hex for the style manifest palettes (pure math, no deps)."""

import math
import re

_NUM = re.compile(r"[\d.]+")


def _gamma(c):
    c = max(0.0, min(1.0, c))
    return 1.055 * c ** (1 / 2.4) - 0.055 if c > 0.0031308 else 12.92 * c


def oklch_to_hex(value):
    """'oklch(L C H)' (L 0..1, C, H degrees) -> '#rrggbb', channels clamped."""
    L, C, H = [float(v) for v in _NUM.findall(value)[:3]]
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return "#%02x%02x%02x" % tuple(round(_gamma(c) * 255) for c in (r, g, bl))
```

Run the colour tests first: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_brief.py -q -k oklch`. If a listed hex is off by one in a channel, correct the test's expected value to the function's output after confirming by eye that it is the right colour (the spike computed these with the same math).

- [ ] **Step 4: Implement `brief.py`**

```python
"""The brief for one coach's logo batch and the prompts built from it.

Static text lives in module constants (prompt caching); everything
tenant-specific goes through LogoBrief."""

import logging
from dataclasses import dataclass
from typing import Literal

from django.conf import settings
from pydantic import BaseModel, Field

from apps.core import ai as core_ai

from .color import oklch_to_hex

logger = logging.getLogger(__name__)

ROLES = ("background", "surface", "primary", "accent", "ink", "muted")
_STYLE_KEYS = {"background": "background", "surface": "surface", "primary": "primary", "accent": "accent", "ink": "foreground", "muted": "mutedForeground"}
ARCHETYPES = ("mark_name", "wordmark", "emblem")
_COMPOSITION = {
    "mark_name": "a symbol or pictorial mark on the left with the brand name set beside it",
    "wordmark": "a wordmark-led design where the typography itself is the logo, with at most one small graphic element",
    "emblem": "an emblem: mark and name inside one enclosing shape",
}
# Display family -> what to tell the image model. Default below for the rest.
_TYPOGRAPHY_BY_DISPLAY = {
    "Cormorant": "a light high-contrast serif (Cormorant-like) paired with a clean sans",
    "Newsreader": "an editorial transitional serif (Newsreader-like)",
    "Instrument Serif": "a sharp high-contrast serif (Instrument Serif-like)",
    "Bodoni Moda": "a didone serif with hairline contrast (Bodoni-like)",
    "Fraunces": "a soft, warm old-style serif (Fraunces-like)",
    "Spectral": "a bookish serif (Spectral-like)",
    "Source Serif 4": "a readable transitional serif",
    "Shippori Mincho": "a Japanese-flavoured serif (Mincho-like), wide letter-spacing",
    "Cinzel": "an inscriptional roman capitals face (Cinzel-like)",
    "Young Serif": "a chunky friendly serif",
    "Zilla Slab": "a sturdy slab serif",
    "Alegreya": "a calligraphic humanist serif",
    "JetBrains Mono": "a monospace display face (JetBrains Mono-like)",
    "Syne": "a wide expressive grotesque",
    "Unbounded": "an extra-wide geometric display sans",
    "Host Grotesk": "a neutral grotesque",
    "Archivo": "a bold condensed grotesque",
    "Bricolage Grotesque": "a quirky high-contrast grotesque",
    "Fredoka": "a rounded playful sans",
    "Anybody": "a wide variable grotesque",
}
_DEFAULT_TYPOGRAPHY = "a clean geometric sans"


@dataclass(frozen=True)
class LogoBrief:
    brand: str
    business: str
    mood: str
    typography: str
    palette: dict  # role -> hex, roles = ROLES
    style_id: str
    palette_id: str


class Concept(BaseModel):
    concept: str = Field(max_length=200)
    archetype: Literal["mark_name", "wordmark", "emblem"]


class _Concepts(BaseModel):
    concepts: list[Concept] = Field(default_factory=list)


def _style_palette(style_id, palette_id):
    from apps.tenant_config import sections

    style = sections.style(style_id) or {}
    variant = sections.palettes(style_id).get(palette_id) if palette_id else None
    raw = (variant or {}).get("palette") or style.get("palette") or {}
    return {role: oklch_to_hex(raw[key]) if raw.get(key) else default for role, key, default in (
        ("background", "background", "#ffffff"), ("surface", "surface", "#f3f3f3"), ("primary", "primary", "#222222"),
        ("accent", "accent", "#888888"), ("ink", "foreground", "#111111"), ("muted", "mutedForeground", "#666666"))}, style


def logo_brief(tenant, answers):
    from apps.core.onboarding.ai_curate import CoachBrief

    coach = CoachBrief.from_tenant(tenant)
    style_id = str(answers.get("style") or "")
    palette_id = str(answers.get("palette") or "")
    palette, style = _style_palette(style_id, palette_id)
    display = ((style.get("fonts") or {}).get("display") or "").strip()
    business = coach.subject or coach.niche.replace("_", " ")
    if coach.description:
        business = f"{business}: {coach.description.strip()[:160]}"
    return LogoBrief(
        brand=tenant.name or coach.brand_name or "",
        business=business,
        mood=str(style.get("mood") or "calm, modern, professional"),
        typography=_TYPOGRAPHY_BY_DISPLAY.get(display, _DEFAULT_TYPOGRAPHY),
        palette=palette,
        style_id=style_id,
        palette_id=palette_id,
    )


def image_prompt(brief, concept):
    c = brief.palette
    return (
        "You are a senior brand designer. Design a finished, professional logo for a coaching business.\n"
        f'Brand name: "{brief.brand}" (spell it exactly). The brand name is the only text in the logo.\n'
        f"Business: {brief.business}.\nBrand mood: {brief.mood}\nTypography direction: {brief.typography}.\n"
        f"Mark concept: {concept.concept}.\n"
        f"Palette: background {c['background']}, surface {c['surface']}, primary {c['primary']}, accent {c['accent']}, "
        f"text {c['ink']}, muted {c['muted']}. Use only these colours.\n"
        f"Composition: {_COMPOSITION[concept.archetype]}. Flat vector style, crisp edges, no gradients, no shadows, no 3D, "
        "no texture, no mockup, no frame. No words, letters or characters other than the brand name. Generous margin, "
        f"the whole logo centered on a plain {c['background']} background, aspect ratio 4:3. It must survive being shrunk to 32 pixels."
    )


CONCEPTS_SYSTEM_PROMPT = """You are a senior brand designer briefing an illustrator.
Given a coaching brand, propose mark concepts: each a different visual metaphor for THIS business, concrete enough to draw
in one sentence (what is depicted, in what drawing manner), never a generic salon/spa/wellness trope, never clip-art.
Return concepts in the order of the archetypes asked for, one per archetype."""


def _default_concepts(count):
    base = [
        Concept(concept="a single-line symbol of what the coach teaches, drawn with one uniform stroke", archetype="mark_name"),
        Concept(concept="the brand name alone, set with one distinctive typographic detail", archetype="wordmark"),
        Concept(concept="a simple symbol of the practice inside a circle with the name beneath", archetype="emblem"),
    ]
    return (base * 3)[:count]


def concepts_for(brief, *, count, avoid=(), defects=()):
    """``count`` concepts, archetypes rotating mark_name -> wordmark -> emblem.
    Never raises: a provider failure returns the defaults."""
    archetypes = [ARCHETYPES[i % 3] for i in range(count)]
    user = "\n".join([
        f"Brand: {brief.brand}", f"Business: {brief.business}", f"Mood: {brief.mood}", f"Typography: {brief.typography}",
        f"Archetypes, in order: {', '.join(archetypes)}",
        *([f"Do not reuse these ideas: {'; '.join(avoid)}"] if avoid else []),
        *([f"A previous round was criticised for: {'; '.join(defects)}. Avoid those failings."] if defects else []),
    ])
    try:
        parsed, _cost, _model = core_ai.structured(
            system=CONCEPTS_SYSTEM_PROMPT, user=user, output_model=_Concepts, model=settings.AGENTC_PRO_MODEL,
            max_tokens=800, label="contentor:logo-concepts", effort="max", timeout_seconds=90,
        )
    except core_ai.AiError:
        logger.warning("logo concepts: provider failed, using defaults")
        return _default_concepts(count)
    out = [c for c in parsed.concepts if c.concept.strip()][:count]
    if len(out) < count:
        out += _default_concepts(count)[len(out):]
    # The model's order is advisory; the archetypes stay balanced.
    return [c.model_copy(update={"archetype": archetype}) for c, archetype in zip(out, archetypes)]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_brief.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/logo_gen backend/apps/tenant_config/tests/test_logo_gen_brief.py backend/apps/tenant_config/tests/conftest.py
git commit -m "feat(logo-gen): palette conversion, logo brief, concepts and the image prompt"
```

---

### Task 3: Vectorize, snap and crop (`logo_vector.py`)

**Files:**
- Create: `backend/apps/tenant_config/logo_vector.py`
- Create: `backend/apps/tenant_config/tests/fixtures/logo_gen/terminal.png`, `yoga.png`, `wordmark.png` (copied from the spike: `~/ws/agent-studio-runs/logo-spike/hub_terminal.png`, `hub_yoga.png`, and the "wordmark-led" API image from `scratchpad/logo-spike/png3/16_gemini-3-pro-im_yoga_wordmark-led.png`; each < 300 KB)
- Test: `backend/apps/tenant_config/tests/test_logo_vector.py`

**Interfaces:**
- Produces:
  - `vectorize(png_bytes: bytes, palette: dict[str, str]) -> dict | None` → `{"view_box": [100.0, H], "paths": [{"d": str, "role": str, "fill_rule"?: str}]}`.
  - `icon_crop(png_bytes: bytes, palette: dict[str, str]) -> bytes | None` (512×512 PNG).
  - `ink_margin(png_bytes: bytes, background_hex: str) -> float` (smallest side margin as a fraction of the shorter image side).
  - `MAX_PATHS = 400`, `MAX_TOTAL_CHARS = 300_000`.

- [ ] **Step 1: Copy the fixtures**

```bash
mkdir -p backend/apps/tenant_config/tests/fixtures/logo_gen
cp ~/ws/agent-studio-runs/logo-spike/hub_terminal.png backend/apps/tenant_config/tests/fixtures/logo_gen/terminal.png
cp ~/ws/agent-studio-runs/logo-spike/hub_yoga.png backend/apps/tenant_config/tests/fixtures/logo_gen/yoga.png
cp "/private/tmp/claude-501/-Users-tahayusufkomur-ws-projects-active-home-server-contentor/7e894fc7-ec19-448f-a05c-1c37b1e8ccbc/scratchpad/logo-spike/png3/16_gemini-3-pro-im_yoga_wordmark-led.png" backend/apps/tenant_config/tests/fixtures/logo_gen/wordmark.png
ls -la backend/apps/tenant_config/tests/fixtures/logo_gen/   # each must be < 300 KB; if the scratchpad is gone, regenerate one wordmark-led logo with the spike's gen3.py prompt
```

- [ ] **Step 2: Write the failing tests**

`backend/apps/tenant_config/tests/test_logo_vector.py`:

```python
"""logo_vector: colour trace -> role-snapped paths, icon crop, margin."""

import io
import re
from pathlib import Path

from PIL import Image, ImageDraw

from apps.tenant_config import logo_vector
from apps.tenant_config.logo_recipe import _PATH_D_RE

FIX = Path(__file__).parent / "fixtures" / "logo_gen"
TERMINAL = {"background": "#0f1a14", "surface": "#171f1a", "primary": "#4ade80", "accent": "#e2b53a", "ink": "#dff5e6", "muted": "#9fb3a6"}
YOGA = {"background": "#ffffff", "surface": "#f3f3f3", "primary": "#2b2b2b", "accent": "#d9731a", "ink": "#2b2b2b", "muted": "#777777"}


def _synthetic(bg="#ffffff", ink="#222222", accent="#d9731a"):
    """A 400x300 'logo': an accent disc on the left, an ink bar (the 'name') on the right, a clear gap between."""
    im = Image.new("RGB", (400, 300), bg)
    d = ImageDraw.Draw(im)
    d.ellipse((40, 100, 140, 200), fill=accent)
    d.rectangle((200, 130, 360, 170), fill=ink)
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def test_vectorize_snaps_roles_and_drops_the_background():
    mark = logo_vector.vectorize(_synthetic(), YOGA)
    roles = {p["role"] for p in mark["paths"]}
    assert roles <= {"accent", "ink", "primary", "muted", "surface"} and "background" not in roles
    assert "accent" in roles and ("ink" in roles or "primary" in roles)
    assert mark["view_box"][0] == 100 and 0 < mark["view_box"][1] < 100


def test_vectorize_paths_pass_the_recipe_whitelist_and_fold_translate():
    mark = logo_vector.vectorize(_synthetic(), YOGA)
    for p in mark["paths"]:
        assert _PATH_D_RE.match(p["d"]), p["d"][:40]
        assert not re.search(r"\d\.\d{3}", p["d"])  # <= 2 decimals
        assert "transform" not in p
    xs = [float(v) for p in mark["paths"] for v in re.findall(r"-?\d+(?:\.\d+)?", p["d"])[0::2]]
    assert min(xs) >= 1.5 and max(xs) <= 98.5  # fitted into the box with margin


def test_vectorize_rejects_over_cap(monkeypatch):
    monkeypatch.setattr(logo_vector, "MAX_PATHS", 1)
    assert logo_vector.vectorize(_synthetic(), YOGA) is None


def test_vectorize_real_logo_fixture_stays_within_caps():
    mark = logo_vector.vectorize((FIX / "terminal.png").read_bytes(), TERMINAL)
    assert mark is not None
    assert len(mark["paths"]) <= logo_vector.MAX_PATHS
    assert sum(len(p["d"]) for p in mark["paths"]) <= logo_vector.MAX_TOTAL_CHARS
    assert {p["role"] for p in mark["paths"]} >= {"primary", "ink"}


def test_icon_crop_returns_the_left_cluster_as_a_square():
    icon = logo_vector.icon_crop(_synthetic(), YOGA)
    im = Image.open(io.BytesIO(icon))
    assert im.size == (512, 512)
    # the disc (accent) is inside, the bar (ink) is not
    px = im.convert("RGB")
    colours = {px.getpixel((x, y)) for x in range(0, 512, 16) for y in range(0, 512, 16)}
    assert any(abs(c[0] - 0xD9) < 12 and abs(c[2] - 0x1A) < 12 for c in colours)
    assert not any(c == (0x22, 0x22, 0x22) for c in colours)


def test_icon_crop_is_none_for_a_wordmark():
    assert logo_vector.icon_crop((FIX / "wordmark.png").read_bytes(), YOGA) is None


def test_icon_crop_real_mark_name_logo():
    assert logo_vector.icon_crop((FIX / "yoga.png").read_bytes(), YOGA) is not None


def test_ink_margin():
    assert logo_vector.ink_margin(_synthetic(), "#ffffff") >= 0.13  # 40 px of 300
    full = Image.new("RGB", (100, 100), "#000000")
    b = io.BytesIO()
    full.save(b, "PNG")
    assert logo_vector.ink_margin(b.getvalue(), "#ffffff") == 0.0
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_vector.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.tenant_config.logo_vector'`.

- [ ] **Step 4: Implement**

`backend/apps/tenant_config/logo_vector.py`:

```python
"""Generated-logo raster -> role-coloured vector paths, icon crop, margin.

vectorize(png, palette) -> {"view_box": [100, H], "paths": [{"d", "role", "fill_rule"?}]} | None

A full-colour vtracer pass (no 3-colour limit, no 12-path cap: those caps in
logo_trace are for the old icon-only pipeline). Every fill snaps to the
nearest palette role so the logo recolours and gets a dark variant by role
swap; background paths are dropped so the logo is transparent. Output is
CANDIDATE input to logo_recipe's whitelist — the recipe validator re-checks."""

import io
import re

import vtracer
from PIL import Image

ROLES = ("background", "surface", "primary", "accent", "ink", "muted")
MAX_PATHS = 400
MAX_TOTAL_CHARS = 300_000
_MARGIN = 2.0  # units inside the 100-wide box
_MAX_SIDE = 1024
_INK_DIST = 40  # RGB distance from the background that counts as ink

_PATH_RE = re.compile(r'<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})"(?: transform="translate\(([-\d.]+),([-\d.]+)\)")?/>')
_SIZE_RE = re.compile(r'width="(\d+)"\s+height="(\d+)"')
_TOKEN_RE = re.compile(r"([MLCQZmlcqz])|(-?\d*\.?\d+)")
_TRACE = dict(colormode="color", hierarchical="stacked", mode="spline", filter_speckle=6, color_precision=7,
              layer_difference=24, corner_threshold=60, length_threshold=4.0, max_iterations=10, splice_threshold=45, path_precision=2)


def _rgb(hex_):
    return tuple(int(hex_[i : i + 2], 16) for i in (1, 3, 5))


def _dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def _snap(hex_, palette):
    c = _rgb(hex_)
    return min(ROLES, key=lambda role: _dist(c, _rgb(palette[role])))


def _flatten(png, background_hex):
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    im.thumbnail((_MAX_SIDE, _MAX_SIDE))
    bg = Image.new("RGBA", im.size, _rgb(background_hex) + (255,))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def _parse(d, tx, ty):
    """vtracer's absolute M/L/C/Z with a translate offset -> [(cmd, [x, y, ...])]."""
    out, cmd, nums = [], None, []
    for m in _TOKEN_RE.finditer(d):
        if m.group(1):
            if cmd:
                out.append((cmd, nums))
            cmd, nums = m.group(1).upper(), []
        else:
            nums.append(float(m.group(2)))
    if cmd:
        out.append((cmd, nums))
    if any(c not in "MLCQZ" for c, _ in out):
        return None
    return [(c, [v + (tx if i % 2 == 0 else ty) for i, v in enumerate(n)]) for c, n in out]


def _fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def vectorize(png, palette):
    im = _flatten(png, palette["background"])
    buf = io.BytesIO()
    im.save(buf, "PNG")
    svg = vtracer.convert_raw_image_to_svg(buf.getvalue(), img_format="png", **_TRACE)
    shapes = []
    for d, fill, tx, ty in _PATH_RE.findall(svg):
        role = _snap(fill, palette)
        if role == "background":
            continue
        parsed = _parse(d, float(tx or 0), float(ty or 0))
        if not parsed:
            return None
        shapes.append((role, parsed))
    if not shapes or len(shapes) > MAX_PATHS:
        return None
    xs = [v for _, segs in shapes for _, n in segs for v in n[0::2]]
    ys = [v for _, segs in shapes for _, n in segs for v in n[1::2]]
    x0, y0, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
    if w <= 0 or h <= 0:
        return None
    scale = (100 - 2 * _MARGIN) / w
    height = round(h * scale + 2 * _MARGIN, 2)
    paths = []
    for role, segs in shapes:
        parts = []
        for cmd, n in segs:
            coords = [_fmt((v - x0) * scale + _MARGIN) if i % 2 == 0 else _fmt((v - y0) * scale + _MARGIN) for i, v in enumerate(n)]
            parts.append(cmd + " ".join(coords))
        paths.append({"d": "".join(parts), "role": role})
    if sum(len(p["d"]) for p in paths) > MAX_TOTAL_CHARS:
        return None
    return {"view_box": [100.0, height], "paths": paths}


def _ink_mask(png, background_hex, step=2):
    im = Image.open(io.BytesIO(png)).convert("RGB")
    w, h = im.size
    px = im.load()
    bg = _rgb(background_hex)
    cols = [False] * w
    rows = [False] * h
    for y in range(0, h, step):
        for x in range(0, w, step):
            if _dist(px[x, y], bg) > _INK_DIST:
                cols[x] = rows[y] = True
    return im, cols, rows


def ink_margin(png, background_hex):
    im, cols, rows = _ink_mask(png, background_hex)
    w, h = im.size
    if not any(cols):
        return 0.0
    x0, x1 = cols.index(True), len(cols) - 1 - cols[::-1].index(True)
    y0, y1 = rows.index(True), len(rows) - 1 - rows[::-1].index(True)
    return round(min(x0, y0, w - 1 - x1, h - 1 - y1) / min(w, h), 3)


def icon_crop(png, palette):
    """The mark alone: the ink cluster left of the widest empty column gap,
    padded to a square, 512 px. None when no gap splits the ink (a wordmark)."""
    im, cols, rows = _ink_mask(png, palette["background"], step=1)
    w, h = im.size
    if not any(cols):
        return None
    first, last = cols.index(True), len(cols) - 1 - cols[::-1].index(True)
    best, start, run = (0, 0), None, 0
    for x in range(first, last + 1):
        if not cols[x]:
            start = x if start is None else start
            run += 1
            if run > best[0]:
                best = (run, start)
        else:
            start, run = None, 0
    gap, gap_start = best
    if gap < 0.03 * w:
        return None
    left_cols = cols[: gap_start]
    lx0, lx1 = left_cols.index(True), len(left_cols) - 1 - left_cols[::-1].index(True)
    if lx1 - lx0 < 0.05 * w:
        return None
    px = im.load()
    bg = _rgb(palette["background"])
    ys = [y for y in range(h) if any(_dist(px[x, y], bg) > _INK_DIST for x in range(lx0, lx1 + 1, 2))]
    ly0, ly1 = min(ys), max(ys)
    side = max(lx1 - lx0, ly1 - ly0)
    pad = int(side * 0.12)
    cx, cy = (lx0 + lx1) // 2, (ly0 + ly1) // 2
    half = side // 2 + pad
    box = (cx - half, cy - half, cx + half, cy + half)
    square = Image.new("RGB", (2 * half, 2 * half), bg)
    square.paste(im.crop(box), (0, 0))
    out = io.BytesIO()
    square.resize((512, 512), Image.LANCZOS).save(out, "PNG")
    return out.getvalue()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_vector.py -q`
Expected: PASS. If `test_icon_crop_real_mark_name_logo` fails, print the gap found (`gap / w`) and lower the `0.03` threshold to the measured value minus a little; it must stay above `0.01`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/logo_vector.py backend/apps/tenant_config/tests/test_logo_vector.py backend/apps/tenant_config/tests/fixtures/logo_gen
git commit -m "feat(logo-gen): colour trace to palette-role vector paths, icon crop, ink margin"
```

---

### Task 4: Gates (`logo_gen/gates.py`)

**Files:**
- Create: `backend/apps/tenant_config/logo_gen/gates.py`
- Test: `backend/apps/tenant_config/tests/test_logo_gen_gates.py`

**Interfaces:**
- Consumes: `logo_vector.ink_margin`.
- Produces:
  - `normalise(text: str) -> str`.
  - `read_back_prompt(files: list[str], brand: str) -> str`.
  - `parse_read_back(text: str) -> dict[str, dict]` (file → `{"text_seen", "extra_glyphs"}`; `{}` on bad JSON).
  - `text_ok(seen: dict | None, brand: str) -> bool`.
  - `margin_ok(png: bytes, background_hex: str) -> bool` (≥ 0.06).
  - `judge_prompt(files: list[str], brand: str, business: str, mood: str) -> str`.
  - `parse_judge(text: str, count: int) -> dict` → `{"ranking": [positions], "reasons": {pos: str}, "defects": {pos: [str]}}`, positions 1-based, validated.
  - `MIN_MARGIN = 0.06`.

- [ ] **Step 1: Write the failing tests**

```python
"""logo_gen.gates: the deterministic checks and the prompt/parse pairs."""

import json

from apps.tenant_config.logo_gen import gates


def test_normalise_folds_case_whitespace_and_punctuation_keeps_diacritics():
    assert gates.normalise("  Görkem   Hancı — YOGA! ") == "görkem hancı yoga"
    assert gates.normalise("Shift-Left") == "shift left"


def test_text_ok_exact_match_only():
    assert gates.text_ok({"text_seen": "ELARA FACE YOGA", "extra_glyphs": False}, "Elara Face Yoga")
    assert not gates.text_ok({"text_seen": "Elara Face Yog", "extra_glyphs": False}, "Elara Face Yoga")
    assert not gates.text_ok({"text_seen": "Elara Face Yoga Natural lift", "extra_glyphs": False}, "Elara Face Yoga")
    assert not gates.text_ok({"text_seen": "Elara Face Yoga", "extra_glyphs": True}, "Elara Face Yoga")
    assert not gates.text_ok(None, "Elara Face Yoga")


def test_read_back_prompt_names_every_file_and_the_schema():
    p = gates.read_back_prompt(["a/cand_1.png", "a/cand_2.png"], "Elara Face Yoga")
    assert "a/cand_1.png" in p and "a/cand_2.png" in p and "text_seen" in p and "extra_glyphs" in p


def test_parse_read_back_tolerates_fences_and_garbage():
    body = {"a/cand_1.png": {"text_seen": "Elara Face Yoga", "extra_glyphs": False}}
    assert gates.parse_read_back("```json\n" + json.dumps(body) + "\n```") == body
    assert gates.parse_read_back("not json") == {}


def test_parse_judge_validates_positions_and_fills_missing():
    out = gates.parse_judge(json.dumps({"ranking": [2, 1, 9, 2], "reasons": {"2": "clean"}, "defects": {"1": ["cramped"]}}), 3)
    assert out["ranking"] == [2, 1, 3]
    assert out["reasons"] == {2: "clean"} and out["defects"] == {1: ["cramped"]}
    assert gates.parse_judge("garbage", 3)["ranking"] == [1, 2, 3]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_gates.py -q`
Expected: FAIL with `ImportError: cannot import name 'gates'`.

- [ ] **Step 3: Implement**

```python
"""Deterministic gates for generated logo candidates, plus the vision
prompts (read-back, judge) and their tolerant parsers. No model opinion
decides a gate: the read-back only transcribes."""

import json
import re
import unicodedata

from apps.core.ai import _strip_fences
from apps.tenant_config import logo_vector

MIN_MARGIN = 0.06
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_WS = re.compile(r"\s+")


def normalise(text):
    text = unicodedata.normalize("NFC", str(text or "")).casefold()
    text = _PUNCT.sub(" ", text.replace("-", " ").replace("_", " "))
    return _WS.sub(" ", text).strip()


def text_ok(seen, brand):
    if not isinstance(seen, dict) or seen.get("extra_glyphs"):
        return False
    return normalise(seen.get("text_seen")) == normalise(brand) != ""


def margin_ok(png, background_hex):
    return logo_vector.ink_margin(png, background_hex) >= MIN_MARGIN


def read_back_prompt(files, brand):
    listed = "\n".join(f"- {f}" for f in files)
    return (
        "Open each of these image files with your file viewer (paths are relative to the current directory):\n"
        f"{listed}\n\nEach is a logo. For each file, transcribe EVERY word, letter or character visible, verbatim, and say whether "
        f'there are any glyphs beyond the brand name "{brand}" (extra words, symbols that read as letters, non-Latin characters, seals with characters).\n'
        'Reply with ONLY a JSON object keyed by file path: {"<path>": {"text_seen": "<verbatim>", "extra_glyphs": true|false}, ...}'
    )


def parse_read_back(text):
    try:
        data = json.loads(_strip_fences(text))
    except (TypeError, ValueError):
        return {}
    return {k: v for k, v in data.items() if isinstance(v, dict)} if isinstance(data, dict) else {}


def judge_prompt(files, brand, business, mood):
    listed = "\n".join(f"{i}. {f}" for i, f in enumerate(files, 1))
    return (
        f'Open each of these logo candidates for "{brand}" ({business}; brand mood: {mood}) with your file viewer:\n{listed}\n\n'
        "Rank ALL of them from best to worst as a senior brand designer would, judging distinctiveness, mark quality, typography, "
        "composition, brand fit and survival at favicon size. Numbers refer to the list above.\n"
        'Reply with ONLY: {"ranking": [n, ...], "reasons": {"<n>": "<one sentence>"}, "defects": {"<n>": ["<short, concrete>", ...]}}'
    )


def parse_judge(text, count):
    fallback = {"ranking": list(range(1, count + 1)), "reasons": {}, "defects": {}}
    try:
        data = json.loads(_strip_fences(text))
    except (TypeError, ValueError):
        return fallback
    if not isinstance(data, dict):
        return fallback
    ranking = []
    for n in data.get("ranking") or []:
        if isinstance(n, int) and 1 <= n <= count and n not in ranking:
            ranking.append(n)
    ranking += [n for n in range(1, count + 1) if n not in ranking]
    reasons = {int(k): str(v)[:300] for k, v in (data.get("reasons") or {}).items() if str(k).isdigit() and 1 <= int(k) <= count}
    defects = {int(k): [str(d)[:120] for d in v][:5] for k, v in (data.get("defects") or {}).items()
               if str(k).isdigit() and 1 <= int(k) <= count and isinstance(v, list)}
    return {"ranking": ranking, "reasons": reasons, "defects": defects}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_gates.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_gen/gates.py backend/apps/tenant_config/tests/test_logo_gen_gates.py
git commit -m "feat(logo-gen): margin and read-back gates, judge prompt and parsers"
```

---

### Task 5: `LogoCandidate` model

**Files:**
- Modify: `backend/apps/tenant_config/models.py` (append after `TenantConfig`, before `SeededObject`)
- Create: `backend/apps/tenant_config/migrations/0028_logocandidate.py` (generated)
- Test: `backend/apps/tenant_config/tests/test_logo_candidate_model.py`

**Interfaces:**
- Produces `LogoCandidate` with fields: `batch: str(16)`, `position: int`, `state: "ready"|"rejected"`, `reject_reason: str(40)`, `source: "hub"|"api"`, `concept: str`, `archetype: str(16)`, `prompt: str`, `png: FK media.Photo | None`, `icon: FK media.Photo | None`, `vector: dict | None`, `rank: int | None`, `judge_reason: str`, `created_at`. Manager default ordering `("batch", "rank", "position")`.

- [ ] **Step 1: Write the failing test**

```python
import pytest

from apps.tenant_config.models import LogoCandidate


@pytest.mark.django_db
def test_candidate_defaults_and_ordering(tenant_with_interview):
    tenant, _ = tenant_with_interview
    from django_tenants.utils import tenant_context

    with tenant_context(tenant):
        LogoCandidate.objects.create(batch="b1", position=2, concept="two", archetype="wordmark", prompt="p", rank=1)
        LogoCandidate.objects.create(batch="b1", position=1, concept="one", archetype="mark_name", prompt="p", rank=2)
        rows = list(LogoCandidate.objects.filter(batch="b1"))
        assert [r.position for r in rows] == [2, 1]
        assert rows[0].state == "ready" and rows[0].source == "hub" and rows[0].vector is None and rows[0].png is None
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_candidate_model.py -q`
Expected: FAIL with `ImportError: cannot import name 'LogoCandidate'`.

- [ ] **Step 3: Add the model**

```python
class LogoCandidate(models.Model):
    """One generated logo in a setup batch (apps.tenant_config.logo_gen).
    Tenant schema. The current batch id lives in Tenant.wizard_state
    ["logo_batch"]; older batches stay until the tenant is erased."""

    STATES = (("ready", "ready"), ("rejected", "rejected"))
    SOURCES = (("hub", "hub"), ("api", "api"))

    batch = models.CharField(max_length=16, db_index=True)
    position = models.PositiveSmallIntegerField()
    state = models.CharField(max_length=10, choices=STATES, default="ready")
    reject_reason = models.CharField(max_length=40, blank=True, default="")
    source = models.CharField(max_length=8, choices=SOURCES, default="hub")
    concept = models.TextField()
    archetype = models.CharField(max_length=16)
    prompt = models.TextField()
    png = models.ForeignKey("media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    icon = models.ForeignKey("media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    vector = models.JSONField(null=True, blank=True)  # logo_vector.vectorize() output
    rank = models.PositiveSmallIntegerField(null=True, blank=True)  # 1 = best
    judge_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "tenant_config"
        ordering = ["batch", "rank", "position"]

    def __str__(self):
        return f"{self.batch}/{self.position} {self.state}"
```

Generate the migration: `docker compose exec -T django python manage.py makemigrations tenant_config -n logocandidate`. Inspect it: one `CreateModel`, FKs to `media.photo`, index on `batch`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `make test-fresh` once (new migration), then `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_candidate_model.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/models.py backend/apps/tenant_config/migrations/0028_logocandidate.py backend/apps/tenant_config/tests/test_logo_candidate_model.py
git commit -m "feat(logo-gen): LogoCandidate model"
```

---

### Task 6: The batch pipeline and the Celery task

**Files:**
- Create: `backend/apps/tenant_config/logo_gen/pipeline.py`
- Modify: `backend/apps/core/tasks.py` (append after `rank_curated_logos`)
- Modify: `backend/apps/tenant_config/logo_image.py` (append `read_text`)
- Test: `backend/apps/tenant_config/tests/test_logo_gen_pipeline.py`

**Interfaces:**
- Consumes: Task 1 (`agentc_image_run`, `agentc_vision_run`, `agentc_run_file`, `AiError`), Task 2 (`logo_brief`, `concepts_for`, `image_prompt`), Task 3 (`vectorize`, `icon_crop`), Task 4 (gates), Task 5 (`LogoCandidate`), `apps.core.platform.uploads._store_object`, `apps.core.storage.build_s3_path`, `apps.tenant_config.logo_image._generate_one`.
- Produces:
  - `pipeline.start_batch(tenant, *, more: bool = False) -> str | None` — writes `wizard_state["logo_batch"]`, enqueues the task on commit, returns the batch id or `None` when one is already building.
  - `pipeline.run_batch(tenant, batch_id: str) -> None` — the whole pipeline; ends with `logo_batch.state` `ready` or `failed`.
  - `pipeline.batch_state(tenant) -> dict` — `{"id", "state", "started_at", ...}` with staleness applied (`building` older than 15 min → `failed`).
  - `tasks.generate_logo_candidates(tenant_id, batch_id)` Celery task, `soft_time_limit=900`.
  - `logo_image.read_text(png_bytes) -> dict | None` — `{"text_seen", "extra_glyphs"}` via the Gemini API (API fallback only).

- [ ] **Step 1: Write the failing tests**

```python
"""logo_gen.pipeline: batch lifecycle with a fake hub (requests faked at
apps.core.ai), fake vectorizer where geometry does not matter."""

import io
import json

import pytest
from django_tenants.utils import tenant_context
from PIL import Image

from apps.core import ai
from apps.core.tests.test_ai_agentc import _Hub, _Resp
from apps.tenant_config.logo_gen import brief as lb
from apps.tenant_config.logo_gen import pipeline
from apps.tenant_config.models import LogoCandidate


def _png(colour="#8c4451"):
    im = Image.new("RGB", (400, 300), "#f8eeea")
    from PIL import ImageDraw

    d = ImageDraw.Draw(im)
    d.ellipse((40, 100, 140, 200), fill=colour)
    d.rectangle((200, 130, 360, 170), fill="#3f2a2b")
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


class _LogoHub(_Hub):
    """Image runs succeed (file bytes served from ``files``); vision runs
    answer read-back then judge from ``answers``."""

    def __init__(self, answers, files=None, fail_positions=()):
        super().__init__(results=[], events=("tool", "text"))
        self.answers = list(answers)
        self.files = files or {}
        self.fail_positions = set(fail_positions)

    def post(self, url, json=None, timeout=None):
        resp = super().post(url, json=json, timeout=timeout)
        if json and "Save the generated image as" in json["prompt"]:
            self.results.append('{"file": "x", "image_model": "imagen-3"}')
        elif json:
            self.results.append(self.answers.pop(0) if self.answers else "{}")
        return resp

    def get(self, url, params=None, timeout=None, stream=False):
        if url.endswith("/file"):
            path = params["path"]
            n = int(path.rsplit("_", 1)[1].split(".")[0])
            if n in self.fail_positions:
                return _Resp({"error": "missing"}, status=404)
            r = _Resp({}, status=200)
            r.content = self.files.get(path, _png())
            return r
        return super().get(url, params=params, timeout=timeout, stream=stream)


@pytest.fixture
def logo_hub(settings, monkeypatch):
    settings.AI_PROVIDER = "agentc"
    settings.LOGO_GEN_ENABLED = True
    settings.LOGO_GEN_CANDIDATES = 3
    settings.AGENTC_HUB = "http://hub:39300/"
    settings.AGENTC_ACCOUNTS = ["studio-a", "studio-b", "studio-c"]
    settings.AGENTC_RUNS_DIR = ""
    monkeypatch.setattr(ai, "AGENTC_POLL_SECONDS", 0)
    monkeypatch.setattr(lb, "concepts_for", lambda b, **kw: [
        lb.Concept(concept="a", archetype="mark_name"), lb.Concept(concept="b", archetype="wordmark"), lb.Concept(concept="c", archetype="emblem")])
    monkeypatch.setattr("apps.core.platform.uploads._store_object", lambda key, fileobj, ct: None)

    def install(hub):
        monkeypatch.setattr(ai.requests, "post", lambda *a, **k: hub.post(*a, **k))
        monkeypatch.setattr(ai.requests, "get", lambda *a, **k: hub.get(*a, **k))
        return hub

    return install


def _read_back(*paths, text="Elara Face Yoga", extra=False):
    return json.dumps({p: {"text_seen": text, "extra_glyphs": extra} for p in paths})


@pytest.mark.django_db
def test_start_batch_locks_and_enqueues(tenant_with_interview, monkeypatch, settings):
    settings.LOGO_GEN_ENABLED = True
    tenant, _ = tenant_with_interview
    calls = []
    monkeypatch.setattr("apps.core.tasks.generate_logo_candidates.delay", lambda *a: calls.append(a))
    bid = pipeline.start_batch(tenant)
    assert bid and pipeline.batch_state(tenant)["state"] == "building"
    assert pipeline.start_batch(tenant) is None  # already building
    from django.db import transaction

    transaction.get_connection().run_and_clear_commit_hooks()  # fire on_commit in tests
    assert calls == [(tenant.id, bid)]


@pytest.mark.django_db
def test_stale_building_batch_counts_as_failed(tenant_with_interview):
    tenant, _ = tenant_with_interview
    tenant.wizard_state = {"logo_batch": {"id": "old", "state": "building", "started_at": "2020-01-01T00:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    assert pipeline.batch_state(tenant)["state"] == "failed"
    assert pipeline.start_batch(tenant) is not None


@pytest.mark.django_db
def test_run_batch_happy_path(tenant_with_interview, logo_hub):
    tenant, answers = tenant_with_interview
    files = [f"logo-candidates/{tenant.schema_name}/b1/cand_{n}.png" for n in (1, 2, 3)]
    hub = logo_hub(_LogoHub([_read_back(*files), json.dumps({"ranking": [2, 3, 1], "reasons": {"2": "clean"}, "defects": {"1": ["generic"]}})]))
    tenant.wizard_state = {"logo_batch": {"id": "b1", "state": "building", "started_at": "2026-10-09T20:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    with tenant_context(tenant):
        pipeline.run_batch(tenant, "b1")
        rows = list(LogoCandidate.objects.filter(batch="b1"))
    assert [r.rank for r in rows] == [1, 2, 3] and [r.position for r in rows] == [2, 3, 1]
    assert all(r.state == "ready" and r.png_id and r.vector for r in rows)
    assert rows[0].judge_reason == "clean" and rows[2].reject_reason == ""
    tenant.refresh_from_db()
    assert tenant.wizard_state["logo_batch"] == {"id": "b1", "state": "ready", "started_at": "2026-10-09T20:00:00+00:00", "defects": ["generic"]}
    image_bodies = [c for c in hub.created if "Save the generated image as" in c["prompt"]]
    assert len(image_bodies) == 3 and {c["model"] for c in image_bodies} == {"gemini-3.8-flash-high"}
    assert all(c["timeoutSec"] == 420 for c in image_bodies)


@pytest.mark.django_db
def test_one_missing_file_and_one_bad_read_back_leave_one_candidate(tenant_with_interview, logo_hub):
    tenant, _ = tenant_with_interview
    files = [f"logo-candidates/{tenant.schema_name}/b2/cand_{n}.png" for n in (1, 2, 3)]
    rb = json.dumps({files[1]: {"text_seen": "Elara Face Yog", "extra_glyphs": False}, files[2]: {"text_seen": "Elara Face Yoga", "extra_glyphs": False}})
    logo_hub(_LogoHub([rb], fail_positions={1}))
    tenant.wizard_state = {"logo_batch": {"id": "b2", "state": "building", "started_at": "2026-10-09T20:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    with tenant_context(tenant):
        pipeline.run_batch(tenant, "b2")
        by_pos = {r.position: r for r in LogoCandidate.objects.filter(batch="b2")}
    assert by_pos[1].state == "rejected" and by_pos[1].reject_reason == "fetch"
    assert by_pos[2].state == "rejected" and by_pos[2].reject_reason == "read_back"
    assert by_pos[3].state == "ready" and by_pos[3].rank == 1  # single survivor: judge skipped
    tenant.refresh_from_db()
    assert tenant.wizard_state["logo_batch"]["state"] == "ready"


@pytest.mark.django_db
def test_zero_survivors_retries_once_then_fails(tenant_with_interview, logo_hub, monkeypatch):
    tenant, _ = tenant_with_interview
    logo_hub(_LogoHub([_read_back(), _read_back()], fail_positions={1, 2, 3}))
    tenant.wizard_state = {"logo_batch": {"id": "b3", "state": "building", "started_at": "2026-10-09T20:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    with tenant_context(tenant):
        pipeline.run_batch(tenant, "b3")
        assert LogoCandidate.objects.filter(batch="b3").count() == 6  # two rounds
    tenant.refresh_from_db()
    assert tenant.wizard_state["logo_batch"]["state"] == "failed"


@pytest.mark.django_db
def test_hub_refusal_falls_back_to_the_api(tenant_with_interview, logo_hub, monkeypatch, settings):
    tenant, _ = tenant_with_interview
    settings.GEMINI_API_KEY = "k"
    hub = _LogoHub([])
    hub.create_state = "rejected"
    logo_hub(hub)
    monkeypatch.setattr("apps.tenant_config.logo_image._generate_one", lambda prompt, model=None: (_png(), 0.04))
    monkeypatch.setattr("apps.tenant_config.logo_image.read_text", lambda png: {"text_seen": "Elara Face Yoga", "extra_glyphs": False})
    spent = []
    monkeypatch.setattr("apps.tenant_config.logo_api.record_attempt_cost", lambda schema, cost: spent.append(cost), raising=False)
    tenant.wizard_state = {"logo_batch": {"id": "b4", "state": "building", "started_at": "2026-10-09T20:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    with tenant_context(tenant):
        pipeline.run_batch(tenant, "b4")
        rows = list(LogoCandidate.objects.filter(batch="b4", state="ready"))
    assert len(rows) == 3 and {r.source for r in rows} == {"api"} and [r.rank for r in rows] == [1, 2, 3]
```

Check `record_attempt_cost`'s real home (`grep -n "def record_attempt_cost" backend/apps/tenant_config/*.py`) and patch that path.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_pipeline.py -q`
Expected: FAIL with `ImportError: cannot import name 'pipeline'`.

- [ ] **Step 3: Implement `pipeline.py`**

```python
"""One batch of generated logo candidates, start to stored rows.

start_batch() is called from the interview (milestones) and the "three
more" endpoint; run_batch() runs inside the Celery task, in tenant
context. Every failure path ends in wizard_state["logo_batch"]["state"]
being "ready" (>= 1 candidate) or "failed"; nothing raises past here."""

import io
import logging
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.core import ai as core_ai
from apps.tenant_config import logo_vector

from . import brief as lb
from . import gates

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=15)
_PNG = "image/png"


def batch_state(tenant):
    batch = dict((tenant.wizard_state or {}).get("logo_batch") or {})
    if batch.get("state") == "building":
        started = parse_datetime(str(batch.get("started_at") or "")) if batch.get("started_at") else None
        if started is None or timezone.now() - started > STALE_AFTER:
            batch["state"] = "failed"
    return batch


def _write_batch(tenant, **fields):
    tenant.refresh_from_db(fields=["wizard_state"])
    state = dict(tenant.wizard_state or {})
    state["logo_batch"] = {**(state.get("logo_batch") or {}), **fields}
    tenant.wizard_state = state
    tenant.save(update_fields=["wizard_state"])


def start_batch(tenant, *, more=False):
    if not settings.LOGO_GEN_ENABLED:
        return None
    current = batch_state(tenant)
    if current.get("state") == "building":
        return None
    batch_id = secrets.token_hex(6)
    _write_batch(tenant, id=batch_id, state="building", started_at=timezone.now().isoformat(), more=more,
                 prev=current.get("id") or "", defects=current.get("defects") or [])
    from apps.core import tasks

    tenant_id = tenant.id
    transaction.on_commit(lambda: tasks.generate_logo_candidates.delay(tenant_id, batch_id))
    return batch_id


def _store_png(tenant, batch_id, name, data):
    from apps.core.platform.uploads import _store_object
    from apps.core.storage import build_s3_path
    from apps.media.models import Photo

    key = build_s3_path("logo-candidates", batch_id, name)
    _store_object(key, io.BytesIO(data), _PNG)
    return Photo.objects.create(s3_key=key, title="Logo candidate", content_type=_PNG, file_size=len(data))


def _generate_hub(tenant, batch_id, position, prompt):
    """-> (png bytes | None, reason, hub_path). Never raises."""
    path = f"logo-candidates/{tenant.schema_name}/{batch_id}/cand_{position}.png"
    try:
        run_id = core_ai.agentc_image_run(prompt, path, label="contentor:logo-gen")
    except core_ai.AiError as exc:
        logger.warning("logo gen %s/%s: hub run failed: %s", batch_id, position, exc)
        return None, "hub", path
    try:
        return core_ai.agentc_run_file(run_id, path), "", path
    except core_ai.AiError as exc:
        logger.warning("logo gen %s/%s: file fetch failed: %s", batch_id, position, exc)
        return None, "fetch", path


def _generate_api(tenant, position, prompt):
    from apps.tenant_config import logo_api, logo_image

    png, cost = logo_image._generate_one(prompt)
    logo_api.record_attempt_cost(tenant.schema_name, cost)
    return png, ("" if png else "api"), ""


def _round(tenant, batch_id, brief, concepts, use_api):
    """Generate, fetch, vectorize, gate one round -> list of candidate dicts."""
    from apps.tenant_config.models import LogoCandidate

    prompts = [lb.image_prompt(brief, c) for c in concepts]
    rows = [LogoCandidate(batch=batch_id, position=i + 1, concept=c.concept, archetype=c.archetype, prompt=p,
                          source="api" if use_api else "hub") for i, (c, p) in enumerate(zip(concepts, prompts))]
    gen = (lambda r: _generate_api(tenant, r.position, r.prompt)) if use_api else (lambda r: _generate_hub(tenant, batch_id, r.position, r.prompt))
    with ThreadPoolExecutor(max_workers=len(rows)) as pool:
        results = list(pool.map(gen, rows))
    survivors = []
    for row, (png, reason, hub_path) in zip(rows, results):
        if not png:
            row.state, row.reject_reason = "rejected", reason
            continue
        row.png = _store_png(tenant, batch_id, f"cand_{row.position}.png", png)
        row.vector = logo_vector.vectorize(png, brief.palette)
        if row.vector is None:
            row.state, row.reject_reason = "rejected", "vector"
            continue
        if not gates.margin_ok(png, brief.palette["background"]):
            row.state, row.reject_reason = "rejected", "margin"
            continue
        icon = logo_vector.icon_crop(png, brief.palette)
        if icon:
            row.icon = _store_png(tenant, batch_id, f"icon_{row.position}.png", icon)
        survivors.append((row, png, hub_path))
    # read-back: one vision run for the whole round (hub), or per-image API calls (fallback)
    if survivors:
        seen = {}
        if use_api:
            from apps.tenant_config import logo_image

            seen = {hub_path or f"api:{row.position}": logo_image.read_text(png) for row, png, hub_path in survivors}
        else:
            try:
                reply = core_ai.agentc_vision_run(gates.read_back_prompt([p for _, _, p in survivors], brief.brand), label="contentor:logo-readback")
                seen = gates.parse_read_back(reply)
            except core_ai.AiError as exc:
                logger.warning("logo gen %s: read-back failed: %s", batch_id, exc)
        kept = []
        for row, png, hub_path in survivors:
            key = hub_path or f"api:{row.position}"
            if gates.text_ok(seen.get(key), brief.brand):
                kept.append((row, hub_path))
            else:
                row.state, row.reject_reason = "rejected", "read_back"
        survivors = kept
    for row in rows:
        row.save()
    return [row for row, _ in survivors], {row.pk: hub_path for row, hub_path in survivors}


def _judge(tenant, brief, survivors, paths, use_api):
    """Rank survivors in place (rank, judge_reason) -> defect list for the next round."""
    if len(survivors) < 2 or use_api:
        for i, row in enumerate(sorted(survivors, key=lambda r: r.position), 1):
            row.rank = i
            row.save(update_fields=["rank"])
        return []
    files = [paths[r.pk] for r in survivors]
    try:
        reply = core_ai.agentc_vision_run(gates.judge_prompt(files, brief.brand, brief.business, brief.mood), label="contentor:logo-judge")
        verdict = gates.parse_judge(reply, len(survivors))
    except core_ai.AiError as exc:
        logger.warning("logo judge failed: %s", exc)
        verdict = gates.parse_judge("", len(survivors))
    for rank, n in enumerate(verdict["ranking"], 1):
        row = survivors[n - 1]
        row.rank, row.judge_reason = rank, verdict["reasons"].get(n, "")
        row.save(update_fields=["rank", "judge_reason"])
    return [d for n in verdict["defects"] for d in verdict["defects"][n]]


def run_batch(tenant, batch_id):
    from apps.tenant_config import interview_brief

    answers = interview_brief.answers_of(tenant)
    current = batch_state(tenant)
    brief = lb.logo_brief(tenant, answers)
    count = settings.LOGO_GEN_CANDIDATES
    avoid, defects = [], list(current.get("defects") or [])
    use_api = False
    try:
        for attempt in range(2):
            concepts = lb.concepts_for(brief, count=count, avoid=avoid, defects=defects)
            survivors, paths = _round(tenant, batch_id, brief, concepts, use_api)
            if not survivors and not use_api and _hub_refused(tenant, batch_id) and settings.GEMINI_API_KEY:
                use_api = True
                survivors, paths = _round(tenant, batch_id, brief, concepts, use_api)
            if survivors:
                defects = _judge(tenant, brief, survivors, paths, use_api)
                _write_batch(tenant, state="ready", defects=defects[:6])
                return
            avoid += [c.concept for c in concepts]
    except Exception:  # the task must always leave a terminal state
        logger.exception("logo gen %s crashed", batch_id)
    _write_batch(tenant, state="failed")


def _hub_refused(tenant, batch_id):
    """Every row of this batch so far was rejected before a file existed."""
    from apps.tenant_config.models import LogoCandidate

    reasons = set(LogoCandidate.objects.filter(batch=batch_id).values_list("reject_reason", flat=True))
    return reasons and reasons <= {"hub"}
```

Append to `backend/apps/core/tasks.py`:

```python
@shared_task(soft_time_limit=900, time_limit=960)
def generate_logo_candidates(tenant_id, batch_id):
    """Generated logo candidates for the /setup interview's logo card
    (apps.tenant_config.logo_gen.pipeline). Fail-silent: the batch state
    in wizard_state is the only outcome."""
    from apps.core.models import Tenant
    from apps.tenant_config.logo_gen import pipeline

    tenant = Tenant.objects.filter(id=tenant_id).first()
    if tenant is None:
        return
    with tenant_context(tenant):
        pipeline.run_batch(tenant, batch_id)
```

Append to `backend/apps/tenant_config/logo_image.py` (API fallback read-back):

```python
_READ_TEXT_PROMPT = (
    "This is a logo. Transcribe EVERY word, letter or character visible, verbatim, and say whether any glyphs beyond the"
    ' brand name are present. Reply with ONLY: {"text_seen": "<verbatim>", "extra_glyphs": true|false}'
)


def read_text(png_bytes):
    """Vision read-back through the API (used only when the hub is unavailable) -> dict | None."""
    import json

    try:
        response = requests.post(
            _ENDPOINT.format(model=settings.GEMINI_MODEL),
            headers={"x-goog-api-key": settings.GEMINI_API_KEY},
            json={"contents": [{"parts": [{"inlineData": {"mimeType": "image/png", "data": base64.b64encode(png_bytes).decode()}}, {"text": _READ_TEXT_PROMPT}]}],
                  "generationConfig": {"responseMimeType": "application/json", "temperature": 0}},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return json.loads(response.json()["candidates"][0]["content"]["parts"][0]["text"])
    except Exception:
        logger.exception("logo image: read-back call failed")
        return None
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_pipeline.py -q`
Expected: PASS. Common failure: the fake hub's `created` order under the thread pool; the assertions only count image bodies, so order does not matter.

- [ ] **Step 5: Run the stale-state check against the celery registration trap**

The dev celery worker only registers tasks present at start (see memory: dev-stack staleness). Restart the worker once: `docker compose restart celery-worker`, then `docker compose exec -T celery-worker celery -A config.celery inspect registered | grep generate_logo_candidates`.
Expected: the task name listed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/logo_gen/pipeline.py backend/apps/core/tasks.py backend/apps/tenant_config/logo_image.py backend/apps/tenant_config/tests/test_logo_gen_pipeline.py
git commit -m "feat(logo-gen): batch pipeline — parallel hub runs, vectorize, gates, judge, API fallback"
```

---

### Task 7: The `generated` mark kind — recipe validator, shared types, renderer, Studio note

**Files:**
- Modify: `backend/apps/tenant_config/logo_recipe.py:18-34, 213-230`
- Modify: `packages/shared/src/logo/types.ts:50-75`
- Modify: `packages/shared/src/logo/migrate.ts` (no code change needed; parity test only)
- Modify: `packages/shared/src/logo/logo-renderer.tsx:144-250, 574-709`
- Modify: `frontend-customer/src/components/logo/studio-panel/mark-controls.tsx:20-32`
- Test: `backend/apps/tenant_config/tests/test_logo_recipe.py`, `packages/shared/src/logo/__tests__/migrate.test.ts` (or wherever `migrate.test.ts` lives: `find packages frontend-customer -name "migrate.test.ts"`), new `packages/shared/src/logo/__tests__/generated-mark.test.tsx` beside it.

**Interfaces:**
- Produces (Python): `MARK_TYPES` includes `"generated"`; `GENERATED_ROLES = {"background","surface","primary","accent","ink","muted"}`; `MARK_GENERATED_MAX_PATHS = 400`, `MARK_GENERATED_MAX_TOTAL = 300_000`; `_generated_mark(raw) -> dict` (initials fallback); `validate_recipe` passes `colors.roles` through as `{role: hex}` when present.
- Produces (TS): `GeneratedPath { d: string; role: GeneratedRole; fill_rule?: "nonzero"|"evenodd" }`, `GeneratedRole`, `LogoMark` variant `{ type: "generated"; view_box: [number, number]; paths: GeneratedPath[]; name_in_mark: boolean }`, `LogoRecipe.colors.roles?: Partial<Record<GeneratedRole, string>>`.
- Renderer: a generated mark fills the mark slot; with `name_in_mark` the name and tagline slots are not drawn and the mark takes the whole canvas width.

- [ ] **Step 1: Run impact analysis**

GitNexus `impact({target: "validate_recipe", direction: "upstream"})` and `impact({target: "MarkContent", direction: "upstream"})`. Expected: serializers, logo_ai/logo_converse, compose.apply_wizard_logo (Python); LogoRenderer, MarkRenderer, studio canvas/gallery (TS). Risk MEDIUM: additive enum + optional field; existing shapes unchanged. Report, proceed.

- [ ] **Step 2: Write the failing Python tests**

Append to `backend/apps/tenant_config/tests/test_logo_recipe.py`:

```python
def _generated(paths=None, roles=None):
    return {
        "version": 3, "layout": "horizontal", "name": "Elara", "tagline": "",
        "mark": {"type": "generated", "view_box": [100, 42.5], "name_in_mark": True,
                 "paths": paths if paths is not None else [{"d": "M2 2L98 2L98 40.5Z", "role": "primary"}, {"d": "M10 10L20 10L20 20Z", "role": "ink", "fill_rule": "evenodd"}]},
        "badge": {"shape": "none", "outline": False},
        "typography": {"name": {"font": "Inter", "weight": 700, "tracking": 0, "case": "none"}, "tagline": {"font": "Inter", "weight": 500, "tracking": 0.08, "case": "upper"}},
        "colors": {"palette_id": None, "badge": {"type": "solid", "color": "#ffffff"}, "mark": "#8c4451", "text": "#3f2a2b", "tagline": "#7a5f60",
                   "roles": roles if roles is not None else {"background": "#f8eeea", "surface": "#f2e2dd", "primary": "#8c4451", "accent": "#a6713a", "ink": "#3f2a2b", "muted": "#7a5f60"}},
        "elements": {"mark": {"offset": [0, 0], "scale": 1}, "name": {"offset": [0, 0], "scale": 1}, "tagline": {"offset": [0, 0], "scale": 1}},
    }


def test_validate_recipe_generated_mark_roundtrips():
    out = validate_recipe(_generated())
    assert out["mark"]["type"] == "generated" and out["mark"]["name_in_mark"] is True
    assert out["mark"]["view_box"] == [100.0, 42.5] and len(out["mark"]["paths"]) == 2
    assert out["mark"]["paths"][1] == {"d": "M10 10L20 10L20 20Z", "role": "ink", "fill_rule": "evenodd"}
    assert out["colors"]["roles"]["primary"] == "#8c4451"


def test_validate_recipe_generated_mark_drops_bad_paths_and_falls_back():
    bad = _generated(paths=[{"d": "M0 0 url(#x)", "role": "primary"}, {"d": "M1 1L2 2Z", "role": "nope"}])
    out = validate_recipe(bad)
    assert out["mark"]["type"] == "generated" and out["mark"]["paths"] == [{"d": "M1 1L2 2Z", "role": "primary"}]
    assert validate_recipe(_generated(paths=[]))["mark"] == {"type": "initials", "style": "plain"}


def test_validate_recipe_generated_mark_caps():
    too_many = _generated(paths=[{"d": "M1 1L2 2Z", "role": "ink"}] * 401)
    assert validate_recipe(too_many)["mark"]["type"] == "initials"


def test_validate_recipe_roles_only_known_hex():
    out = validate_recipe(_generated(roles={"primary": "#123456", "weird": "#000000", "ink": "red"}))
    assert out["colors"]["roles"] == {"primary": "#123456"}


def test_validate_recipe_without_roles_has_no_roles_key():
    plain = _generated()
    del plain["colors"]["roles"]
    assert "roles" not in validate_recipe(plain)["colors"]
```

- [ ] **Step 3: Run them to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_recipe.py -q -k generated`
Expected: FAIL with `ValidationError` on `mark.type` (`generated` not in `MARK_TYPES`).

- [ ] **Step 4: Implement the Python side**

In `logo_recipe.py`:

```python
MARK_TYPES = {"icon", "initials", "abstract", "image", "custom", "generated"}
# Generated (whole-logo) marks: a colour trace of an image-model logo, fills
# as palette roles (apps.tenant_config.logo_vector). Sized for 30-170 paths.
GENERATED_ROLES = {"background", "surface", "primary", "accent", "ink", "muted"}
MARK_GENERATED_MAX_PATHS = 400
MARK_GENERATED_MAX_TOTAL = 300_000
```

After `_custom_mark`:

```python
def _generated_mark(raw_mark):
    """Generated logo mark: role-coloured paths in a 100-wide box. Same
    whitelist as custom marks; invalid paths are dropped, nothing left =
    plain initials."""
    raw_paths = raw_mark.get("paths") if isinstance(raw_mark.get("paths"), list) else []
    paths, total = [], 0
    for raw_path in raw_paths:
        if len(paths) >= MARK_GENERATED_MAX_PATHS:
            return {"type": "initials", "style": "plain"}
        if not isinstance(raw_path, dict):
            continue
        d = str(raw_path.get("d") or "")
        if not d or not _PATH_D_RE.match(d):
            continue
        total += len(d)
        if total > MARK_GENERATED_MAX_TOTAL:
            return {"type": "initials", "style": "plain"}
        role = raw_path.get("role")
        entry = {"d": d, "role": role if role in GENERATED_ROLES else "primary"}
        if raw_path.get("fill_rule") in ("nonzero", "evenodd"):
            entry["fill_rule"] = raw_path["fill_rule"]
        paths.append(entry)
    if not paths:
        return {"type": "initials", "style": "plain"}
    raw_box = raw_mark.get("view_box") if isinstance(raw_mark.get("view_box"), list) else []
    height = _num(raw_box[1] if len(raw_box) > 1 else None, 1, 1000, 100.0)
    return {"type": "generated", "view_box": [100.0, float(height)], "paths": paths, "name_in_mark": bool(raw_mark.get("name_in_mark", True))}
```

In `validate_recipe`, add the branch before the image fallback:

```python
    elif mark_type == "generated":
        mark = _generated_mark(raw_mark)
```

and after the `mark_accent` block:

```python
    if isinstance(raw_colors.get("roles"), dict):
        roles = {k: v for k, v in raw_colors["roles"].items() if k in GENERATED_ROLES and isinstance(v, str) and _HEX_RE.match(v)}
        if roles:
            colors["roles"] = roles
```

Also extend the module docstring's KEEP IN SYNC note to mention `generated`.

- [ ] **Step 5: Run the Python tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_recipe.py -q`
Expected: PASS (all, including the pre-existing parity fixture).

- [ ] **Step 6: Write the failing TS tests**

Find the test dir: `find packages/shared/src/logo frontend-customer/src/lib/logo -name "migrate.test.ts"`. Create `generated-mark.test.tsx` beside it:

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isRecipe, migrateRecipe } from "../migrate";
import { LogoRenderer, MarkRenderer } from "../logo-renderer";
import type { LogoRecipe } from "../types";

const recipe: LogoRecipe = {
  version: 3,
  layout: "horizontal",
  name: "Elara",
  tagline: "",
  mark: {
    type: "generated",
    view_box: [100, 50],
    name_in_mark: true,
    paths: [
      { d: "M2 2L98 2L98 48Z", role: "primary" },
      { d: "M10 10L20 10L20 20Z", role: "ink", fill_rule: "evenodd" },
    ],
  },
  badge: { shape: "none", outline: false },
  typography: {
    name: { font: "Inter", weight: 700, tracking: 0, case: "none" },
    tagline: { font: "Inter", weight: 500, tracking: 0.08, case: "upper" },
  },
  colors: {
    palette_id: null,
    badge: { type: "solid", color: "#ffffff" },
    mark: "#8c4451",
    text: "#3f2a2b",
    tagline: "#7a5f60",
    roles: { primary: "#8c4451", ink: "#3f2a2b" },
  },
  elements: {
    mark: { offset: [0, 0], scale: 1 },
    name: { offset: [0, 0], scale: 1 },
    tagline: { offset: [0, 0], scale: 1 },
  },
};

describe("generated mark", () => {
  it("migrates through untouched", () => {
    expect(isRecipe(recipe)).toBe(true);
    expect(migrateRecipe(recipe)).toEqual(recipe);
  });

  it("renders paths in role colours and no name when the name is in the mark", () => {
    const html = renderToStaticMarkup(createElement(LogoRenderer, { recipe }));
    expect(html).toContain('fill="#8c4451"');
    expect(html).toContain('fill="#3f2a2b"');
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).not.toContain('data-part="name"');
    expect(html).toContain('viewBox="0 0 640 200"');
  });

  it("draws the name when name_in_mark is false", () => {
    const r = { ...recipe, mark: { ...recipe.mark, name_in_mark: false } } as LogoRecipe;
    expect(renderToStaticMarkup(createElement(LogoRenderer, { recipe: r }))).toContain('data-part="name"');
  });

  it("square mark render uses the paths, not initials", () => {
    const html = renderToStaticMarkup(createElement(MarkRenderer, { recipe }));
    expect(html).toContain("M2 2L98 2L98 48Z");
    expect(html).not.toContain("<text");
  });

  it("falls back to colors.mark for a role without a colour", () => {
    const r = { ...recipe, colors: { ...recipe.colors, roles: {} } } as LogoRecipe;
    expect(renderToStaticMarkup(createElement(LogoRenderer, { recipe: r }))).toContain('fill="#8c4451"');
  });
});
```

Run: `cd frontend-customer && npx vitest run <path-to>/generated-mark.test.tsx`
Expected: FAIL on type errors / no `fill="#3f2a2b"`.

- [ ] **Step 7: Implement the TS side**

`types.ts`, after `CustomMarkPath`:

```ts
export type GeneratedRole =
  | "background"
  | "surface"
  | "primary"
  | "accent"
  | "ink"
  | "muted";

/** One filled path of a generated (whole-logo) mark, in a 100-wide box of
 * height view_box[1]; `role` resolves against LogoRecipe.colors.roles. */
export interface GeneratedPath {
  d: string;
  role: GeneratedRole;
  fill_rule?: "nonzero" | "evenodd";
}
```

Add to the `LogoMark` union:

```ts
  // Generated logo (setup): the whole lockup traced from an image-model
  // render. name_in_mark means the brand name is inside the paths, so the
  // renderer draws no name/tagline text.
  | {
      type: "generated";
      view_box: [number, number];
      paths: GeneratedPath[];
      name_in_mark: boolean;
    };
```

In `LogoRecipeV2.colors` add `roles?: Partial<Record<GeneratedRole, string>>;` (it flows into `LogoRecipe` through `Omit`).

`logo-renderer.tsx`:

1. In `MarkContent`, before the `custom` branch:

```tsx
  if (mark.type === "generated" && mark.paths.length) {
    const [vw, vh] = mark.view_box;
    const s = size / Math.max(vw, vh);
    const roleColor = (role: GeneratedRole) =>
      recipe.colors.roles?.[role] ?? color;
    return (
      <g transform={`translate(${(size - vw * s) / 2}, ${(size - vh * s) / 2}) scale(${s})`}>
        {mark.paths.map((p, i) => (
          <path key={i} d={p.d} fill={roleColor(p.role)} fillRule={p.fill_rule ?? "nonzero"} />
        ))}
      </g>
    );
  }
```

2. In `LogoRenderer`, compute `const nameInMark = recipe.mark.type === "generated" && recipe.mark.name_in_mark;`. When `nameInMark`: draw the mark group alone, sized to the full canvas (`<g transform="translate(0,0)"><ComposedMark recipe={...} size={vb.h} ... /></g>` is wrong for a wide mark — instead draw the generated paths directly):

```tsx
  if (nameInMark && recipe.mark.type === "generated") {
    const [vw, vh] = recipe.mark.view_box;
    const s = Math.min(vb.w / vw, vb.h / vh);
    const roleColor = (role: GeneratedRole) => recipe.colors.roles?.[role] ?? solidOf(colors.mark);
    return (
      <svg ref={svgRef} viewBox={`0 0 ${vb.w} ${vb.h}`} width={width} height={(width * vb.h) / vb.w} className={className}
        xmlns="http://www.w3.org/2000/svg" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <g data-part="mark" transform={`translate(${(vb.w - vw * s) / 2}, ${(vb.h - vh * s) / 2}) scale(${s})`}>
          {recipe.mark.paths.map((p, i) => (
            <path key={i} d={p.d} fill={roleColor(p.role)} fillRule={p.fill_rule ?? "nonzero"} />
          ))}
        </g>
      </svg>
    );
  }
```

Place this early return after `const vb = logoViewBox(recipe.layout);` and before `computeSlots` is used (hooks: `LogoRenderer` calls none before this point; `ComposedMark` hooks are inside child components, so the early return is hook-safe).

3. In `MarkRenderer`, `hasRealMark` adds `|| (recipe.mark.type === "generated" && recipe.mark.paths.length > 0)`.

Import `GeneratedRole` from `./types`.

`mark-controls.tsx` (Studio): the heading becomes

```tsx
          {recipe.mark.type === "custom"
            ? "AI-drawn mark"
            : recipe.mark.type === "generated"
              ? "Designed in setup"
              : "Mark"}
        </p>
        {recipe.mark.type === "generated" && (
          <p className="text-xs text-muted-foreground">
            This logo was designed for you during setup. Pick another in
            Setup → Logo, or choose a mark below to start over.
          </p>
        )}
```

- [ ] **Step 8: Run the TS tests, typecheck, lint**

Run: `cd frontend-customer && npx vitest run <dir-of>/generated-mark.test.tsx <dir-of>/migrate.test.ts` → PASS.
Run: `make typecheck` → clean for both apps (the `LogoMark` union grew: every exhaustive `switch` over `mark.type` in `packages/shared` and both apps must compile; fix any `never` errors by adding the `generated` case with the same behaviour as `custom`).
Run: `make lint` → clean.

- [ ] **Step 9: Detect changes and commit**

GitNexus `detect_changes()` → affected: `validate_recipe`, `MarkContent`, `LogoRenderer`, `MarkRenderer`, `mark-controls`. Then:

```bash
git add backend/apps/tenant_config/logo_recipe.py backend/apps/tenant_config/tests/test_logo_recipe.py packages/shared/src/logo frontend-customer/src/components/logo/studio-panel/mark-controls.tsx
git commit -m "feat(logo): generated mark kind — role-coloured whole-logo paths in validator, types and renderer"
```

---

### Task 8: Interview wiring — trigger, card block, pick, apply, "three more"

**Files:**
- Modify: `backend/apps/tenant_config/interview_milestones.py:52-60 (_due), 98-115 (_start), 535-560 (logo_cards), 690-715 (apply_style), 784-800 (choose)`
- Modify: `backend/apps/tenant_config/interview.py:449-470 (interview_state)`
- Modify: `backend/apps/core/onboarding/compose.py:295-372 (apply_wizard_logo)`
- Modify: `backend/apps/tenant_config/setup_flow_views.py` (append view), `backend/apps/tenant_config/urls.py:51`
- Test: `backend/apps/tenant_config/tests/test_logo_gen_interview.py`

**Interfaces:**
- Consumes: Task 6 `pipeline.start_batch/batch_state`, Task 5 `LogoCandidate`, Task 7 recipe kind.
- Produces:
  - `_due()` includes `"logo:generate"` when `settings.LOGO_GEN_ENABLED`; `_start` handles `action == "logo"` via `pipeline.start_batch(tenant)`.
  - `apply_style(tenant, style_id, palette)` re-dispatches when a batch exists and style/palette changed.
  - `logo_cards(...)["generated"] = {"state": "building"|"ready"|"none", "options": [{"value": "gen:<id>", "label", "image_url", "rank"}]}`.
  - `interview_state(...)["logo_batch"] = {"state": ...}`.
  - `choose(tenant, answers, "site_logo", "gen:<id>")` → `answers["logo"] = {"mode": "generated", "candidate_id": id}`.
  - `apply_wizard_logo` `generated` branch.
  - `POST /api/v1/admin/setup-flow/logo-more/` → `logo_cards` body.

- [ ] **Step 1: Write the failing tests**

```python
"""The generated-logo wiring in the setup interview."""

import json

import pytest
from django_tenants.utils import tenant_context

from apps.tenant_config import interview_milestones as ms
from apps.tenant_config.logo_gen import pipeline
from apps.tenant_config.models import LogoCandidate, TenantConfig


@pytest.fixture
def ready_batch(tenant_with_interview, settings):
    settings.LOGO_GEN_ENABLED = True
    tenant, answers = tenant_with_interview
    tenant.wizard_state = {"logo_batch": {"id": "b9", "state": "ready", "started_at": "2026-10-09T20:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    from apps.media.models import Photo

    with tenant_context(tenant):
        png = Photo.objects.create(s3_key="tenants/elara/logo-candidates/b9/cand_1.png", title="c")
        icon = Photo.objects.create(s3_key="tenants/elara/logo-candidates/b9/icon_1.png", title="i")
        a = LogoCandidate.objects.create(batch="b9", position=1, concept="a lotus face", archetype="mark_name", prompt="p", png=png, icon=icon, rank=2,
                                         vector={"view_box": [100, 50], "paths": [{"d": "M1 1L2 2Z", "role": "primary"}]})
        b = LogoCandidate.objects.create(batch="b9", position=2, concept="the name alone", archetype="wordmark", prompt="p", png=png, rank=1,
                                         vector={"view_box": [100, 30], "paths": [{"d": "M1 1L3 3Z", "role": "ink"}]})
        LogoCandidate.objects.create(batch="b9", position=3, concept="x", archetype="emblem", prompt="p", state="rejected", reject_reason="read_back")
    return tenant, answers, a, b


@pytest.mark.django_db
def test_due_includes_logo_generate_only_when_enabled(tenant_with_interview, settings, monkeypatch):
    tenant, answers = tenant_with_interview
    monkeypatch.setattr(ms.brief, "settled", lambda a, needs: True)
    settings.LOGO_GEN_ENABLED = True
    assert "logo:generate" in ms._due(tenant, answers)
    settings.LOGO_GEN_ENABLED = False
    assert "logo:generate" not in ms._due(tenant, answers)


@pytest.mark.django_db
def test_start_logo_calls_start_batch(tenant_with_interview, monkeypatch, settings):
    settings.LOGO_GEN_ENABLED = True
    tenant, answers = tenant_with_interview
    calls = []
    monkeypatch.setattr(pipeline, "start_batch", lambda t, **kw: calls.append(kw) or "bid")
    ms._start(tenant, answers, "logo:generate")
    assert calls == [{}]


@pytest.mark.django_db
def test_apply_style_redispatches_when_the_look_changes(ready_batch, monkeypatch):
    tenant, answers, *_ = ready_batch
    calls = []
    monkeypatch.setattr(pipeline, "start_batch", lambda t, **kw: calls.append(kw) or "bid")
    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        cfg.style, cfg.palette = "atelier", ""
        cfg.save(update_fields=["style", "palette"])
        ms.apply_style(tenant, "atelier", "")  # unchanged look
        assert calls == []
        ms.apply_style(tenant, "atelier", "fig")  # new palette
        ms.apply_style(tenant, "dojo", "")  # new style
    assert calls == [{}, {}]


@pytest.mark.django_db
def test_logo_cards_generated_block_is_ranked_and_ready_only(ready_batch):
    tenant, answers, a, b = ready_batch
    with tenant_context(tenant):
        cards = ms.logo_cards(tenant, answers)
    gen = cards["generated"]
    assert gen["state"] == "ready"
    assert [o["value"] for o in gen["options"]] == [f"gen:{b.pk}", f"gen:{a.pk}"]
    assert gen["options"][0]["label"] == "the name alone" and gen["options"][0]["rank"] == 1
    assert gen["options"][0]["image_url"].startswith("http")


@pytest.mark.django_db
def test_logo_cards_building_and_none(tenant_with_interview, settings):
    settings.LOGO_GEN_ENABLED = True
    tenant, answers = tenant_with_interview
    with tenant_context(tenant):
        assert ms.logo_cards(tenant, answers)["generated"] == {"state": "none", "options": []}
        tenant.wizard_state = {"logo_batch": {"id": "b", "state": "building", "started_at": "2099-01-01T00:00:00+00:00"}}
        tenant.save(update_fields=["wizard_state"])
        assert ms.logo_cards(tenant, answers)["generated"]["state"] == "building"


@pytest.mark.django_db
def test_choose_generated_applies_logo_icon_and_recipe(ready_batch):
    tenant, answers, a, b = ready_batch
    with tenant_context(tenant):
        ms.choose(tenant, answers, "site_logo", f"gen:{a.pk}")
        cfg = TenantConfig.objects.first()
    assert answers["logo"] == {"mode": "generated", "candidate_id": a.pk} and answers["site_logo"] == f"gen:{a.pk}"
    assert cfg.logo_id == a.png_id and cfg.icon_id == a.icon_id
    assert cfg.logo_recipe["mark"]["type"] == "generated" and cfg.logo_recipe["mark"]["name_in_mark"] is True
    assert cfg.logo_recipe["colors"]["roles"]["primary"].startswith("#")
    assert cfg.navbar_config["show_brand_name"] is False and cfg.navbar_config["logo_size"] == "lg"


@pytest.mark.django_db
def test_choose_generated_wordmark_leaves_icon_unset(ready_batch):
    tenant, answers, a, b = ready_batch
    with tenant_context(tenant):
        ms.choose(tenant, answers, "site_logo", f"gen:{b.pk}")
        cfg = TenantConfig.objects.first()
    assert cfg.logo_id == b.png_id and cfg.icon_id is None


@pytest.mark.django_db
def test_choose_generated_refuses_rejected_or_unknown(ready_batch):
    tenant, answers, a, b = ready_batch
    with tenant_context(tenant):
        rejected = LogoCandidate.objects.get(batch="b9", position=3)
        for value in (f"gen:{rejected.pk}", "gen:999999", "gen:abc"):
            with pytest.raises(ms.ChoiceError) as exc:
                ms.choose(tenant, answers, "site_logo", value)
            assert str(exc.value) == "unknown_logo"


@pytest.mark.django_db
def test_interview_state_exposes_logo_batch(ready_batch):
    from apps.tenant_config import interview

    tenant, *_ = ready_batch
    with tenant_context(tenant):
        state = interview.interview_state(tenant, TenantConfig.objects.first().setup_flow or {})
    assert state["logo_batch"]["state"] == "ready"


@pytest.mark.django_db
def test_logo_more_endpoint_starts_a_batch_and_returns_cards(ready_batch, monkeypatch, coach_client):
    tenant, *_ = ready_batch
    calls = []
    monkeypatch.setattr(pipeline, "start_batch", lambda t, **kw: calls.append(kw) or "bid")
    resp = coach_client(tenant).post("/api/v1/admin/setup-flow/logo-more/")
    assert resp.status_code == 200 and calls == [{"more": True}]
    assert resp.json()["kind"] == "logo" and "generated" in resp.json()
```

`coach_client` is whatever fixture the existing `test_setup_flow_views*.py` uses to call setup-flow endpoints as the owner; copy its name (`grep -n "def .*client" backend/apps/tenant_config/tests/conftest.py backend/conftest.py`). The setup flow must be `active` for `_setup_over()`; the fixture that creates the tenant should set `setup_flow["status"] = "active"` (see how the existing view tests do it).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_interview.py -q`
Expected: FAIL (`"logo:generate"` missing, `KeyError: 'generated'`, `ChoiceError: unknown_logo` for `gen:` values, 404 on the endpoint).

- [ ] **Step 3: Implement**

`interview_milestones.py`:

```python
# in _due(), replace the first due line:
    due = ["style:auto", "page:home", "rank:logos"]
    if settings.LOGO_GEN_ENABLED:
        due.append("logo:generate")
```

(`from django.conf import settings` at the top.)

```python
# in _start(), new branch after "rank":
    elif action == "logo":
        from .logo_gen import pipeline

        pipeline.start_batch(tenant)
```

`apply_style`: capture the old look first and re-dispatch after the save:

```python
def apply_style(tenant, style_id: str, palette: str = "") -> None:
    from . import sections
    from .logo_gen import pipeline

    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        changed = (cfg.style, cfg.palette) != (style_id, palette)
        cfg.style = style_id
        ... (unchanged body) ...
    _bust(tenant)
    # The palette is inside a generated logo: a new look needs a new batch.
    if changed and (tenant.wizard_state or {}).get("logo_batch"):
        pipeline.start_batch(tenant)
```

(Read the full current body of `apply_style` before editing; keep every existing line, only add `changed` and the trailing block.)

`logo_cards`: add before the `return`:

```python
    generated = generated_logos(tenant)
```

and include `"generated": generated` in the dict; new helper above `logo_cards`:

```python
def generated_logos(tenant) -> dict:
    """The current generated batch for the logo card: ready candidates in
    rank order, a building marker, or nothing."""
    from apps.core.storage import generate_presigned_download_url

    from .logo_gen import pipeline
    from .models import LogoCandidate

    batch = pipeline.batch_state(tenant)
    state = batch.get("state")
    if state == "building":
        return {"state": "building", "options": []}
    if state != "ready":
        return {"state": "none", "options": []}
    rows = LogoCandidate.objects.filter(batch=batch.get("id"), state="ready", png__isnull=False).select_related("png").order_by("rank", "position")
    options = [{"value": f"gen:{r.pk}", "label": r.concept[:60], "image_url": generate_presigned_download_url(r.png.s3_key), "rank": r.rank} for r in rows]
    return {"state": "ready" if options else "none", "options": options}
```

`choose`, in the `site_logo` branch, before the `int(value)` parse:

```python
        elif str(value).startswith("gen:"):
            from .models import LogoCandidate

            try:
                candidate_id = int(str(value)[4:])
            except ValueError:
                raise ChoiceError("unknown_logo") from None
            if not LogoCandidate.objects.filter(pk=candidate_id, state="ready", png__isnull=False).exists():
                raise ChoiceError("unknown_logo")
            logo = {"mode": "generated", "candidate_id": candidate_id}
```

(The query runs in the tenant schema, so a candidate from another tenant does not exist here.)

`interview.py` `interview_state`: add `"logo_batch": {"state": pipeline.batch_state(tenant).get("state") or "none"}` to the returned dict (import `from .logo_gen import pipeline` inside the function).

`compose.py` `apply_wizard_logo`, new branch after the `ai` branch and before the `curated` guard:

```python
    if mode == "generated" and logo.get("candidate_id"):
        from apps.tenant_config.logo_gen.brief import ROLES, logo_brief
        from apps.tenant_config.models import LogoCandidate

        row = LogoCandidate.objects.filter(pk=logo["candidate_id"], state="ready", png__isnull=False).first()
        if row is None:
            return
        config.logo = row.png
        config.icon = row.icon
        config.logo_url = config.icon_url = ""
        palette = logo_brief(tenant, answers).palette
        from apps.tenant_config import logo_recipe as logo_recipe_lib

        config.logo_recipe = logo_recipe_lib.validate_recipe({
            "version": 3, "layout": "horizontal", "name": tenant.name or "", "tagline": "",
            "mark": {"type": "generated", **(row.vector or {}), "name_in_mark": True},
            "badge": {"shape": "none", "outline": False},
            "typography": {"name": {"font": "Inter", "weight": 700, "tracking": 0, "case": "none"},
                           "tagline": {"font": "Inter", "weight": 500, "tracking": 0.08, "case": "upper"}},
            "colors": {"palette_id": None, "badge": {"type": "solid", "color": palette["background"]}, "mark": palette["primary"],
                       "text": palette["ink"], "tagline": palette["muted"], "roles": {r: palette[r] for r in ROLES}},
            "elements": {k: {"offset": [0, 0], "scale": 1} for k in ("mark", "name", "tagline")},
        })
        navbar = dict(config.navbar_config or {})
        navbar["show_brand_name"] = False  # the name is inside the mark
        navbar["logo_size"] = "lg"
        config.navbar_config = navbar
        return
```

`setup_flow_views.py`, append:

```python
@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def setup_flow_logo_more(request):
    """Three more generated logos for the interview's logo card."""
    from .interview_brief import answers_of
    from .logo_gen import pipeline

    if (over := _setup_over()) is not None:
        return over
    tenant = connection.tenant
    pipeline.start_batch(tenant, more=True)
    return Response(interview_milestones.logo_cards(tenant, answers_of(tenant)))
```

`urls.py`: `path("setup-flow/logo-more/", setup_flow_logo_more, name="setup-flow-logo-more"),` after the `logos/` line, and the import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_gen_interview.py apps/tenant_config/tests/test_interview*.py -q`
Expected: PASS, including the existing interview tests (the new due key only appears when `LOGO_GEN_ENABLED`; the test settings default it off unless `AI_PROVIDER=agentc` — check `backend/config/settings/test.py` or the pytest settings and, if it inherits `agentc` from `.env`, pin `LOGO_GEN_ENABLED = False` there so existing tests keep their fired-key expectations).

- [ ] **Step 5: Regenerate the API types and commit**

Run: `cd frontend-customer && npm run gen:api` and review the `src/types/api-generated.ts` diff (expected: a new `setup-flow/logo-more/` operation and nothing else surprising).

```bash
git add backend/apps/tenant_config/interview_milestones.py backend/apps/tenant_config/interview.py backend/apps/core/onboarding/compose.py backend/apps/tenant_config/setup_flow_views.py backend/apps/tenant_config/urls.py backend/apps/tenant_config/tests/test_logo_gen_interview.py frontend-customer/src/types/api-generated.ts
git commit -m "feat(setup): generated logo candidates on the logo card — trigger, pick, apply, three more"
```

---

### Task 9: Frontend — the "Designed for you" row and polling

**Files:**
- Modify: `frontend-customer/src/lib/setup-flow.ts:85-115 (SetupFlowApi), 183-198 (LookCards), 300-310 (InterviewState)`
- Modify: `frontend-customer/src/components/setup-flow/look-cards.tsx:98-125 (props), 355-432 (logo branch)`
- Modify: `frontend-customer/src/components/setup-flow/setup-flow.tsx:207-211 (working), and where `LookCardsView` is rendered (pass `onLogoMore`)`
- Test: `frontend-customer/src/components/setup-flow/__tests__/look-cards.test.ts`

**Interfaces:**
- Consumes: Task 8 card shape and endpoint.
- Produces: `LookCards.generated?: GeneratedLogos`, `GeneratedLogos = { state: "building" | "ready" | "none"; options: LookOption[] }`, `InterviewState.logo_batch?: { state: "building" | "ready" | "failed" | "none" }`, `SetupFlowApi.logoMore: () => Promise<LookCards>`, `LookCardsView` prop `onLogoMore?: () => Promise<LookCards>`.

- [ ] **Step 1: Write the failing tests**

Append to `look-cards.test.ts`:

```ts
const LOGOS: LookCards = {
  kind: "logo",
  options: [{ value: "12", label: "Lotus", image_url: "http://x/12.png" }],
  style: "atelier",
  palette: "",
};
const renderLogos = (generated: LookCards["generated"], onLogoMore = async () => LOGOS) =>
  renderToStaticMarkup(
    createElement(LookCardsView, {
      cards: { ...LOGOS, generated },
      brandName: "Elara",
      disabled: false,
      onPick: () => {},
      onMore: async () => LOGOS,
      onLogoMore,
    }),
  );

describe("LookCardsView generated logos", () => {
  it("shows ranked candidates above the curated grid when ready", () => {
    const html = renderLogos({
      state: "ready",
      options: [
        { value: "gen:2", label: "the name alone", image_url: "http://x/2.png", rank: 1 },
        { value: "gen:1", label: "a lotus face", image_url: "http://x/1.png", rank: 2 },
      ],
    });
    expect(html).toContain("Designed for you");
    expect(html.indexOf("http://x/2.png")).toBeLessThan(html.indexOf("http://x/1.png"));
    expect(html.indexOf("http://x/2.png")).toBeLessThan(html.indexOf("http://x/12.png"));
    expect(html).toContain("Three more");
  });

  it("shows the waiting state with the curated grid still available", () => {
    const html = renderLogos({ state: "building", options: [] });
    expect(html).toContain("Designing your logo");
    expect(html).toContain("http://x/12.png");
    expect(html).not.toContain("Three more");
  });

  it("renders nothing extra when there is no batch", () => {
    const html = renderLogos({ state: "none", options: [] });
    expect(html).not.toContain("Designed for you");
    expect(html).not.toContain("Designing your logo");
  });
});
```

Run: `cd frontend-customer && npx vitest run src/components/setup-flow/__tests__/look-cards.test.ts`
Expected: FAIL (type error on `generated`, missing strings).

- [ ] **Step 2: Implement the types and client**

`setup-flow.ts`:

```ts
export interface GeneratedLogos {
  /** building = a batch is running; ready = options are ranked best first. */
  state: "building" | "ready" | "none";
  options: LookOption[];
}
```

Add `rank?: number;` to `LookOption`, `generated?: GeneratedLogos;` to `LookCards`, `logo_batch?: { state: "building" | "ready" | "failed" | "none" };` to `InterviewState`, and to `SetupFlowApi` + its implementation:

```ts
  logoMore: () => Promise<LookCards>;
  ...
  logoMore: () => clientFetch<LookCards>(`${BASE}/logo-more/`, { method: "POST" }),
```

(Match the `method`/body conventions of the neighbouring `cover`/`draft` calls in the same file.)

- [ ] **Step 3: Implement the row**

`look-cards.tsx`: add the prop `onLogoMore?: () => Promise<LookCards>` to `LookCardsView`. Inside the logo branch, before the `<div className="grid …">` of curated marks:

```tsx
  const generated = shown.generated;
  const { run: logoMore, loading: moreLoading } = useAsyncAction(
    async () => {
      if (onLogoMore) setShown(await onLogoMore());
    },
    { errorToast: "Couldn’t start more logos. Try again." },
  );
  ...
      {generated && generated.state !== "none" && (
        <section className="mb-6" aria-label="Designed for you">
          <p className="mb-2 text-[13px] font-medium text-[var(--sf-graphite)]">
            {generated.state === "ready" ? "Designed for you" : "Designing your logo"}
          </p>
          {generated.state === "building" ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-[var(--sf-tint)] motion-reduce:animate-none" />
              ))}
              <p className="col-span-3 text-xs text-[var(--sf-graphite)]">
                Designing your logo, about two minutes. Pick a ready-made mark below meanwhile, or wait.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {generated.options.map((o, i) => (
                  <CardButton key={o.value} picked={isPicked(o.value, o.label)} disabled={disabled} onClick={() => onPick(o.value, o.label)} style={enter(i)} className="p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.image_url} alt={o.label} className="aspect-[4/3] w-full rounded-lg object-contain" />
                    <span className="mt-2 block truncate text-center text-[13px]">{o.label}</span>
                  </CardButton>
                ))}
              </div>
              {onLogoMore && (
                <Button variant="ghost" size="lg" loading={moreLoading} loadingText="Starting…" disabled={disabled} onClick={() => logoMore()} className="mt-3 rounded-full">
                  Three more
                </Button>
              )}
            </>
          )}
        </section>
      )}
```

Use the skeleton preset from `@/components/ui/skeletons` if one fits a 4:3 tile (check `scripts/check-loading-patterns.mjs` expectations: a raw `animate-pulse` div may be flagged; if so use `<Skeleton className="aspect-[4/3] …" />` from the presets). Hooks (`useAsyncAction`) must be called unconditionally at the top of `LookCardsView`, before the `if (shown.kind === "style")` branches.

`setup-flow.tsx`: `working` adds `|| iv.logo_batch?.state === "building"`; where `LookCardsView` is rendered pass `onLogoMore={api.logoMore}`.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `cd frontend-customer && npx vitest run src/components/setup-flow/__tests__/look-cards.test.ts` → PASS.
Run: `make typecheck && make lint` → clean (the loading-pattern checker must accept the skeleton and the `<Button loading>`).

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/setup-flow.ts frontend-customer/src/components/setup-flow/look-cards.tsx frontend-customer/src/components/setup-flow/setup-flow.tsx frontend-customer/src/components/setup-flow/__tests__/look-cards.test.ts
git commit -m "feat(setup): Designed-for-you row on the logo card with waiting state and three more"
```

---

### Task 10: Verification in the running dev stack

**Files:** none new (manual verification; screenshots to `docs/` are NOT created).

- [ ] **Step 1: Confirm the dev wiring**

`make health-check` → ok. `.env` has `AI_PROVIDER=agentc` and `AGENTC_RUNS_DIR=/agent-studio-runs`; `docker compose exec -T celery-worker ls /agent-studio-runs | head -3` lists the synced directory. Celery worker restarted after Task 6.

- [ ] **Step 2: Run a real batch on the dev tenant**

```bash
docker compose exec -T django python manage.py shell -c "
from apps.core.models import Tenant
from django_tenants.utils import tenant_context
from apps.tenant_config.logo_gen import pipeline
t = Tenant.objects.get(slug='demo-yoga')
with tenant_context(t):
    print(pipeline.start_batch(t))
"
```

Then watch: `docker compose logs -f celery-worker | grep -i "logo gen\|logo-gen"` until the batch ends (expect 2 to 5 minutes). Check the outcome:

```bash
docker compose exec -T django python manage.py shell -c "
from apps.core.models import Tenant
from django_tenants.utils import tenant_context
from apps.tenant_config.models import LogoCandidate
t = Tenant.objects.get(slug='demo-yoga'); print(t.wizard_state.get('logo_batch'))
with tenant_context(t):
    for r in LogoCandidate.objects.all()[:6]: print(r.position, r.state, r.reject_reason, r.rank, r.source, bool(r.vector), r.judge_reason[:60])
"
```

Expected: state `ready`, at least two `ready` rows with ranks, vectors present.

- [ ] **Step 3: See the card**

Open the dev tenant's `/setup` as the coach (see memory: browser-pane coach login via `issue_login_token`), go back to the logo question, and confirm: the "Designed for you" row shows the candidates ranked, picking one updates the header logo and favicon, "Three more" flips the row to the waiting state and the page polls until it refills. Take screenshots of `building` and `ready` with the browser pane and attach them to the task notes (not to the repo).

- [ ] **Step 4: Targeted test run**

Run: `make test-changed` (trust its plan) and `make test-frontend`. Expected: green. Do not run the full suite while the batch above is still generating.

- [ ] **Step 5: Final commit of anything the verification touched**

Only if files changed: `make lint`, then commit with a message describing the fix.

---

## Self-review notes

- Spec §1 trigger → Task 8; §2 brief → Task 2; §3 hub runs → Task 1; §4 vector → Task 3; §5 gates → Task 4; §6 judge → Tasks 4 + 6; §7 storage → Task 5; §8 card → Tasks 8 + 9; §9 apply and recipe → Tasks 7 + 8; §10 failure handling → Task 6; §11 settings → Task 1; testing → every task plus Task 10. No spec section is uncovered.
- Names used across tasks: `agentc_image_run`, `agentc_vision_run`, `agentc_run_file`, `AGENTC_PRO_MODEL`, `AGENTC_IMAGE_TIMEOUT_SECONDS`, `AGENTC_RUNS_DIR`, `LOGO_GEN_ENABLED`, `LOGO_GEN_CANDIDATES` (Task 1) ← used in Tasks 2, 6, 8. `LogoBrief`, `Concept`, `logo_brief`, `concepts_for`, `image_prompt`, `ROLES` (Task 2) ← Tasks 6, 8. `vectorize`, `icon_crop`, `ink_margin`, `MAX_PATHS`, `MAX_TOTAL_CHARS` (Task 3) ← Tasks 4, 6. `normalise`, `text_ok`, `margin_ok`, `read_back_prompt`, `parse_read_back`, `judge_prompt`, `parse_judge` (Task 4) ← Task 6. `LogoCandidate` (Task 5) ← Tasks 6, 8. `start_batch`, `run_batch`, `batch_state` (Task 6) ← Task 8. `generated` mark + `colors.roles` (Task 7) ← Task 8 apply, Task 9 card images (raster only).
- Review Focus coverage: 1 → Task 4 `test_normalise…`/`test_text_ok…`; 2 → Task 3 `test_icon_crop_is_none_for_a_wordmark`, Task 8 `test_choose_generated_wordmark_leaves_icon_unset`; 3 → Task 8 `test_apply_style_redispatches…`; 4 → Task 6 `test_one_missing_file…`, `test_zero_survivors…`; 5 → Task 8 `test_choose_generated_refuses…`.
