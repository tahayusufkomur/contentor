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
    monkeypatch.setattr(
        lb,
        "concepts_for",
        lambda b, **kw: [
            lb.Concept(concept="a", archetype="mark_name"),
            lb.Concept(concept="b", archetype="wordmark"),
            lb.Concept(concept="c", archetype="emblem"),
        ],
    )
    monkeypatch.setattr("apps.core.platform.uploads._store_object", lambda key, fileobj, ct: None)

    def install(hub):
        monkeypatch.setattr(ai.requests, "post", lambda *a, **k: hub.post(*a, **k))
        monkeypatch.setattr(ai.requests, "get", lambda *a, **k: hub.get(*a, **k))
        return hub

    return install


def _read_back(*paths, text="Elara Face Yoga", extra=False):
    return json.dumps({p: {"text_seen": text, "extra_glyphs": extra} for p in paths})


@pytest.mark.django_db
def test_start_batch_locks_and_enqueues(
    tenant_with_interview, monkeypatch, settings, django_capture_on_commit_callbacks
):
    settings.LOGO_GEN_ENABLED = True
    tenant, _ = tenant_with_interview
    calls = []
    monkeypatch.setattr("apps.core.tasks.generate_logo_candidates.delay", lambda *a: calls.append(a))
    with django_capture_on_commit_callbacks(execute=True):
        bid = pipeline.start_batch(tenant)
        assert bid and pipeline.batch_state(tenant)["state"] == "building"
        assert pipeline.start_batch(tenant) is None  # already building
    assert calls == [(tenant.id, bid)]


@pytest.mark.django_db
def test_stale_building_batch_counts_as_failed(tenant_with_interview, settings):
    settings.LOGO_GEN_ENABLED = True
    tenant, _ = tenant_with_interview
    tenant.wizard_state = {"logo_batch": {"id": "old", "state": "building", "started_at": "2020-01-01T00:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    assert pipeline.batch_state(tenant)["state"] == "failed"
    assert pipeline.start_batch(tenant) is not None


@pytest.mark.django_db
def test_run_batch_happy_path(tenant_with_interview, logo_hub):
    tenant, answers = tenant_with_interview
    files = [f"logo-candidates/{tenant.schema_name}/b1/cand_{n}.png" for n in (1, 2, 3)]
    hub = logo_hub(
        _LogoHub(
            [
                _read_back(*files),
                json.dumps({"ranking": [2, 3, 1], "reasons": {"2": "clean"}, "defects": {"1": ["generic"]}}),
            ]
        )
    )
    tenant.wizard_state = {"logo_batch": {"id": "b1", "state": "building", "started_at": "2026-10-09T20:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    with tenant_context(tenant):
        pipeline.run_batch(tenant, "b1")
        rows = list(LogoCandidate.objects.filter(batch="b1"))
    assert [r.rank for r in rows] == [1, 2, 3] and [r.position for r in rows] == [2, 3, 1]
    assert all(r.state == "ready" and r.png_id and r.vector for r in rows)
    assert rows[0].judge_reason == "clean" and rows[2].reject_reason == ""
    tenant.refresh_from_db()
    assert tenant.wizard_state["logo_batch"] == {
        "id": "b1",
        "state": "ready",
        "started_at": "2026-10-09T20:00:00+00:00",
        "defects": ["generic"],
    }
    image_bodies = [c for c in hub.created if "Save the generated image as" in c["prompt"]]
    assert len(image_bodies) == 3 and {c["model"] for c in image_bodies} == {"gemini-3.8-flash-high"}
    assert all(419 <= c["timeoutSec"] <= 420 for c in image_bodies)


@pytest.mark.django_db
def test_one_missing_file_and_one_bad_read_back_leave_one_candidate(tenant_with_interview, logo_hub):
    tenant, _ = tenant_with_interview
    files = [f"logo-candidates/{tenant.schema_name}/b2/cand_{n}.png" for n in (1, 2, 3)]
    rb = json.dumps(
        {
            files[1]: {"text_seen": "Elara Face Yog", "extra_glyphs": False},
            files[2]: {"text_seen": "Elara Face Yoga", "extra_glyphs": False},
        }
    )
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
    monkeypatch.setattr(
        "apps.tenant_config.logo_image.read_text", lambda png: {"text_seen": "Elara Face Yoga", "extra_glyphs": False}
    )
    spent = []
    monkeypatch.setattr("apps.tenant_config.logo_ai.record_attempt_cost", lambda schema, cost: spent.append(cost))
    tenant.wizard_state = {"logo_batch": {"id": "b4", "state": "building", "started_at": "2026-10-09T20:00:00+00:00"}}
    tenant.save(update_fields=["wizard_state"])
    with tenant_context(tenant):
        pipeline.run_batch(tenant, "b4")
        rows = list(LogoCandidate.objects.filter(batch="b4", state="ready"))
    assert len(rows) == 3 and {r.source for r in rows} == {"api"} and [r.rank for r in rows] == [1, 2, 3]
