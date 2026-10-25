"""The reels studio's API and jobs: who may use it, finding moments, editing, rendering through the video
service (HTTP mocked), the end card's token and downloads."""

from datetime import timedelta
from unittest import mock

import pytest
import requests
from django.utils import timezone

from apps.accounts.models import User
from apps.core.storage import build_s3_path
from apps.courses.models import Video
from apps.courses.tests.test_views import make_client
from apps.reels import fonts, framing, jobs, render
from apps.reels.models import Reel
from apps.reels.tests.test_moments import talk


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="coach@reels.test", name="C", password="x", role="coach")


@pytest.fixture()
def video(tenant_ctx):
    key = build_s3_path("videos", "lesson.mp4")
    words = [list(x) for x in talk(sentences=20)]
    return Video.objects.create(
        title="Lesson", s3_key=key, captions_key=key, captions_words=words, duration_seconds=200
    )


@pytest.fixture()
def reel(video):
    return Reel.objects.create(video=video, start=0.0, end=26.0, title="Hook", caption="Post #yoga", score=8)


@pytest.fixture(autouse=True)
def offline_fonts():
    """No test reaches Google Fonts: a lookup fails (and is not kept), the editor gets the typical line ratio."""
    with mock.patch("apps.reels.fonts.requests.get", side_effect=requests.ConnectionError("offline")):
        yield


@pytest.fixture()
def no_ai():
    with mock.patch("apps.reels.moments.ai_compose.compose_available", return_value=False):
        yield


@pytest.mark.django_db(transaction=True)
class TestAccess:
    def test_only_the_coach_and_owner(self, tenant_ctx, reel):
        student = User.objects.create_user(email="student@reels.test", name="S", password="x", role="student")
        assert make_client(student).get("/api/v1/reels/").status_code == 403
        assert make_client().get("/api/v1/reels/videos/").status_code in (401, 403)
        assert make_client(student).get(f"/api/v1/reels/{reel.pk}/").status_code == 403


@pytest.mark.django_db(transaction=True)
class TestSearch:
    def test_a_search_starts_and_finds_moments_by_rule(self, coach, video, reel_jobs, no_ai, tenant_ctx):
        client = make_client(coach)
        res = client.post("/api/v1/reels/search/", {"video": video.pk, "count": 2}, format="json")
        assert res.status_code == 202 and res.json()["status"] == "picking"
        reel_jobs["find_reels"].assert_called_once_with(tenant_ctx.id, video.pk, 2, "coach", 0)

        assert jobs.run_search(video, 2, "coach", 0) is None
        state = client.get(f"/api/v1/reels/search/{video.pk}/").json()
        assert state["status"] == "done" and len(state["reels"]) == 2
        listed = client.get(f"/api/v1/reels/?video={video.pk}").json()
        assert {r["id"] for r in listed} == set(state["reels"])
        assert all(r["status"] == "draft" and r["file"] is None for r in listed)
        row = client.get("/api/v1/reels/videos/").json()["videos"][0]
        assert (row["words"], row["reels"], row["search"]["status"]) == ("ready", 2, "done")

    def test_a_second_search_skips_what_is_taken(self, coach, video, no_ai):
        jobs.run_search(video, 2, "coach", 0)
        jobs.run_search(video, 2, "coach", 0)
        spans = sorted(Reel.objects.values_list("start", "end"))
        assert len(spans) == 4
        assert all(b1 <= a2 + 0.5 for (_a1, b1), (a2, _b2) in zip(spans, spans[1:], strict=False))

    def test_a_video_without_words_waits_for_scribe(self, settings, coach, tenant_ctx, reel_jobs):
        settings.SCRIBE_URL = "http://scribe-api:8000"
        key = build_s3_path("videos", "new.mp4")
        fresh = Video.objects.create(title="New", s3_key=key)
        with mock.patch("apps.courses.captions._call") as scribe:
            res = make_client(coach).post("/api/v1/reels/search/", {"video": fresh.pk, "count": 3}, format="json")
        assert res.status_code == 202 and res.json()["status"] == "transcribing"
        scribe.assert_not_called()  # the web process never calls Scribe: the job does
        with mock.patch("apps.courses.captions._call", return_value={"id": "job1"}) as scribe:
            assert jobs.run_search(fresh, 3, "coach", 0) == jobs.WAIT
        assert scribe.call_args.args[:2] == ("POST", "/v1/transcriptions")
        fresh.refresh_from_db()
        with mock.patch("apps.courses.captions._call", return_value={"status": "working"}):
            assert jobs.run_search(fresh, 3, "coach", jobs.WAIT) == jobs.WAIT
        words = [[0.0, 0.5, " Hi."]]
        with mock.patch(
            "apps.courses.captions._call",
            return_value={"status": "done", "vtt": "WEBVTT", "language": "en", "words": words},
        ):
            assert jobs.run_search(fresh, 3, "coach", 2 * jobs.WAIT) is None  # words in, but too few for a reel
        assert jobs.search_state(fresh.pk)["status"] == "failed"

    def test_scribe_away_for_a_moment_is_waited_for(self, settings, coach, tenant_ctx):
        settings.SCRIBE_URL = "http://scribe-api:8000"
        key = build_s3_path("videos", "old.mp4")
        captioned = Video.objects.create(title="Old", s3_key=key, captions_key=key, captions_vtt="WEBVTT")
        with mock.patch("apps.courses.captions._call", side_effect=requests.ConnectionError("down")):
            assert jobs.run_search(captioned, 3, "coach", 0) == jobs.WAIT
        assert jobs.search_state(captioned.pk)["status"] == "transcribing"

    def test_what_it_refuses(self, coach, tenant_ctx):
        demo = Video.objects.create(title="Demo", s3_key="demo/videos/flow.mp4")
        client = make_client(coach)
        res = client.post("/api/v1/reels/search/", {"video": demo.pk, "count": 3}, format="json")
        assert res.status_code == 409 and "transcript" in res.json()["detail"]
        assert client.post("/api/v1/reels/search/", {"video": demo.pk, "count": 9}, format="json").status_code == 400
        assert client.post("/api/v1/reels/search/", {"video": "x"}, format="json").status_code == 400


@pytest.mark.django_db(transaction=True)
class TestEdit:
    def test_the_editor_gets_what_it_draws(self, coach, reel):
        data = make_client(coach).get(f"/api/v1/reels/{reel.pk}/").json()
        assert data["frame"] == {"layout": "crop", "keys": [[0.0, 0.5]], "share": framing.share(None, None)}
        assert data["options"] == render.OPTIONS
        assert data["keep"][0][0] == 0.0 and data["words"][0][2] == " s0w0"
        assert data["brand"]["fonts"]["caption"] == {"family": "Montserrat", "weight": 800, "ratio": fonts.RATIO}
        assert data["end_card"]["line"] == "More on my site"
        assert data["source"]["url"].startswith("http")

    def test_a_patch_is_checked_then_saved(self, coach, reel):
        client = make_client(coach)
        url = f"/api/v1/reels/{reel.pk}/"
        assert client.patch(url, {"style": "neon"}, format="json").status_code == 400
        assert client.patch(url, {"start": 0, "end": 2}, format="json").status_code == 400
        assert client.patch(url, {"options": {"language": "xx"}}, format="json").status_code == 400
        res = client.patch(
            url, {"title": '"New hook" #tag', "style": "clean", "options": {"progress": False}}, format="json"
        )
        assert res.status_code == 200
        reel.refresh_from_db()
        assert (reel.title, reel.style, render.options_of(reel)["progress"]) == ('"New hook" #tag', "clean", False)

    def test_a_language_translates_the_captions(self, coach, reel):
        with mock.patch("apps.reels.moments.translate", side_effect=lambda lines, lang: [f"de:{x}" for x in lines]):
            res = make_client(coach).patch(f"/api/v1/reels/{reel.pk}/", {"options": {"language": "de"}}, format="json")
        assert res.status_code == 200
        groups = res.json()["translation"]
        assert groups and groups[0]["text"].startswith("de:s0w0")
        reel.refresh_from_db()
        assert render.phrases(reel) == groups
        reel.end = 30.0  # trimmed: the translation's timing no longer fits
        assert render.phrases(reel) is None

    def test_a_trim_past_the_scan_scans_again(self, settings, coach, reel, reel_jobs):
        settings.VIDEO_URL = "http://video:7100"
        Reel.objects.filter(pk=reel.pk).update(
            faces={"from": 0, "to": 29, "width": 1920, "height": 1080, "samples": []}
        )
        client = make_client(coach)
        client.patch(f"/api/v1/reels/{reel.pk}/", {"end": 28}, format="json")
        reel_jobs["scan_reel"].assert_not_called()
        client.patch(f"/api/v1/reels/{reel.pk}/", {"end": 40}, format="json")
        reel_jobs["scan_reel"].assert_called_once()

    def test_delete_removes_the_file(self, coach, reel):
        Reel.objects.filter(pk=reel.pk).update(file_key=build_s3_path("reels", "a.mp4"))
        with mock.patch("apps.reels.render.forget") as forget:
            assert make_client(coach).delete(f"/api/v1/reels/{reel.pk}/").status_code == 204
        forget.assert_called_once()
        assert not Reel.objects.exists()


class _Answer:
    def __init__(self, status=200, payload=None, text=""):
        self.status_code, self._payload, self.text = status, payload or {}, text

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise __import__("requests").HTTPError(str(self.status_code))


FONT_CSS = "src: url(https://fonts.gstatic.com/s/montserrat/v31/x.ttf) format('truetype');"
FONTS = {"caption": "https://fonts.gstatic.com/s/montserrat/v31/x.ttf", "title": ""}


@pytest.fixture()
def own_cache(settings):
    """A cache of the test's own: without xdist, tests share the dev stack's Redis database."""
    settings.CACHES = {
        "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "reels-fonts"}
    }


class TestFonts:
    def test_a_weight_the_family_lacks_falls_back_and_the_file_is_kept(self, own_cache):
        answers = [_Answer(400), _Answer(200, text=FONT_CSS)]
        with mock.patch("apps.reels.fonts.requests.get", side_effect=answers) as asked:
            assert fonts.ttf("Young Serif", 800) == "https://fonts.gstatic.com/s/montserrat/v31/x.ttf"
            assert fonts.ttf("Young Serif", 800).endswith("x.ttf")  # kept: not asked again
        assert asked.call_count == 2
        assert asked.call_args_list[0].args[0].endswith("family=Young+Serif:wght@800")
        assert asked.call_args_list[0].kwargs["headers"] == {"User-Agent": "Mozilla/4.0"}

    def test_the_line_libass_sizes_by_comes_from_the_os2_table(self, own_cache):
        import struct

        # A font with two tables: head (unitsPerEm 1000 at +18) and OS/2 (usWinAscent 968, usWinDescent 594 at +74)
        head = bytearray(54)
        head[18:20] = struct.pack(">H", 1000)
        os2 = bytearray(96)
        os2[74:78] = struct.pack(">HH", 968, 594)
        directory = struct.pack(">IHHHH", 0x00010000, 2, 0, 0, 0)
        start = 12 + 2 * 16
        records = struct.pack(">4sIII", b"head", 0, start, len(head)) + struct.pack(
            ">4sIII", b"OS/2", 0, start + len(head), len(os2)
        )
        font = directory + records + bytes(head) + bytes(os2)
        assert fonts.win_ratio(font) == 1.562
        with mock.patch("apps.reels.fonts.requests.get", return_value=_Answer(200)) as asked:
            asked.return_value.content = font
            assert fonts.line_ratio("https://fonts.gstatic.com/s/x.ttf") == 1.562
            assert fonts.line_ratio("https://fonts.gstatic.com/s/x.ttf") == 1.562  # kept
        assert asked.call_count == 1
        assert fonts.line_ratio("") == fonts.RATIO

    def test_a_lookup_that_fails_is_not_kept(self, own_cache):
        with mock.patch("apps.reels.fonts.requests.get", side_effect=__import__("requests").ConnectionError):
            assert fonts.ttf("Archivo", 700) == ""
        with mock.patch("apps.reels.fonts.requests.get", return_value=_Answer(200, text=FONT_CSS)):
            assert fonts.ttf("Archivo", 700).endswith("x.ttf")


@pytest.mark.django_db(transaction=True)
class TestRender:
    def test_render_queues_and_download_waits_for_the_file(self, settings, coach, reel, reel_jobs):
        client = make_client(coach)
        assert client.post(f"/api/v1/reels/{reel.pk}/render/").status_code == 409  # the video service is off
        settings.VIDEO_URL = "http://video:7100"
        res = client.post(f"/api/v1/reels/{reel.pk}/render/")
        assert res.status_code == 202 and res.json()["status"] == "rendering"
        reel_jobs["render_reel"].assert_called_once()
        assert client.get(f"/api/v1/reels/{reel.pk}/download/").status_code == 409
        # a reel last changed long ago is not "failed" the moment it starts again
        Reel.objects.filter(pk=reel.pk).update(status=Reel.FAILED, updated_at=timezone.now() - timedelta(hours=2))
        res = client.post(f"/api/v1/reels/{reel.pk}/render/")
        assert res.status_code == 202 and res.json()["status"] == "rendering"

    def test_the_job_carries_the_whole_reel_and_the_file_is_kept(self, settings, reel):
        settings.VIDEO_URL = "http://video:7100"
        sent = {}

        def video_service(url, json=None, timeout=None):
            sent.update(json)
            return _Answer(200, {"duration": 24.5, "size": 1234})

        with (
            mock.patch("apps.reels.render.fonts.files", return_value=FONTS),
            mock.patch("apps.reels.render.requests.post", side_effect=video_service),
        ):
            render.run(reel)
        reel.refresh_from_db()
        assert (reel.status, reel.file_size, reel.duration) == (Reel.READY, 1234, 24.5)
        assert reel.file_key.startswith(build_s3_path("reels", str(reel.pk)))
        assert reel.rendered == render.fingerprint(reel)
        assert sent["start"] == 0.0 and sent["end"] == 26.0 and sent["layout"] == "crop"
        assert sent["fonts"] == FONTS
        assert "Style: Caption,@caption" in sent["captions"] and "Hook" in sent["captions"]
        assert sent["progress"].startswith("#") and sent["end_card"] is None  # no browser sidecar in tests
        assert sent["upload"].startswith("http") and sent["source"].startswith("http")

        Reel.objects.filter(pk=reel.pk).update(title="Changed")
        reel.refresh_from_db()
        assert reel.rendered != render.fingerprint(reel)  # stale

    def test_a_failed_render_tells_the_coach(self, settings, reel):
        settings.VIDEO_URL = "http://video:7100"
        with (
            mock.patch("apps.reels.render.fonts.files", return_value=FONTS),
            mock.patch("apps.reels.render.requests.post", return_value=_Answer(422, text="ffmpeg: boom")),
        ):
            render.run(reel)
        reel.refresh_from_db()
        assert reel.status == Reel.FAILED and "Try again" in reel.error

    def test_a_ready_reel_downloads_as_an_attachment(self, coach, reel):
        Reel.objects.filter(pk=reel.pk).update(status=Reel.READY, file_key=build_s3_path("reels", "a.mp4"))
        url = make_client(coach).get(f"/api/v1/reels/{reel.pk}/download/").json()["url"]
        assert "response-content-disposition=attachment" in url and "hook.mp4" in url


@pytest.mark.django_db(transaction=True)
class TestEndCard:
    def test_the_page_reads_it_with_a_fresh_token_only(self, reel):
        token = render.token_for(reel)
        res = make_client().get(f"/api/v1/reels/render/{token}/")
        assert res.status_code == 200 and res.json()["line"] == "More on my site"
        assert make_client().get("/api/v1/reels/render/forged/").status_code == 404


@pytest.mark.django_db(transaction=True)
class TestScan:
    def test_the_faces_are_kept_for_the_crop(self, settings, reel):
        settings.VIDEO_URL = "http://video:7100"
        samples = [[i * 0.25, [[0.1, 0.3, 0.1, 0.2, 0.9]]] for i in range(130)]
        answer = _Answer(200, {"width": 1920, "height": 1080, "duration": 200, "samples": samples})
        with mock.patch("apps.reels.jobs.requests.post", return_value=answer) as post:
            jobs.scan(reel)
        assert post.call_args.kwargs["json"]["start"] == 0.0
        reel.refresh_from_db()
        assert framing.scanned(reel) and framing.frame_of(reel)["keys"][0][1] < 0.2


@pytest.mark.django_db(transaction=True)
class TestCopilot:
    def test_the_marketing_specialist_proposes_and_starts_reels(self, coach, video, reel_jobs, tenant_ctx):
        from apps.core.copilot import content, engine, team

        assert f"{video.pk} | Lesson | 3 | ready" in engine._videos_digest(tenant_ctx)
        card = engine._card(tenant_ctx, engine.MakeReelsAction(kind="make_reels", video_id=video.pk, count=9))
        assert card["title"] == "Make 5 reels from Lesson" and card["token"]
        with pytest.raises(content.ContentOpError):
            engine._card(tenant_ctx, engine.MakeReelsAction(kind="make_reels", video_id=999999))

        result = content.make_reels(coach, {"video_id": video.pk, "count": 2})
        assert result == {
            "kind": "make_reels",
            "id": video.pk,
            "title": "Lesson",
            "url": f"/admin/reels?video={video.pk}",
        }
        reel_jobs["find_reels"].assert_called_once_with(tenant_ctx.id, video.pk, 2, "marketing", 0)
        assert content.created_inverse({"kind": "make_reels"}, result) == {}  # not undone: reels are deleted one by one
        assert team.OWNERS["make_reels"] == "marketing"
