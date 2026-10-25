"""Captions from Scribe: the sweep sends each new file and collects the
WebVTT (Scribe's HTTP mocked), and the player gets them only with the video."""

from decimal import Decimal
from itertools import count
from unittest import mock

import pytest
import requests

from apps.accounts.models import User
from apps.core.storage import build_s3_path
from apps.courses import captions
from apps.courses.models import Course, Lesson, Module, Video
from apps.courses.tasks import sweep_captions
from apps.courses.tests.test_views import make_client

VTT = "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nMerhaba.\n"
WORDS = [[0.0, 1.5, " Merhaba."]]


@pytest.fixture()
def scribe(settings):
    settings.SCRIBE_URL = "http://scribe-api:8000"
    settings.SCRIBE_KEY = "client-key"
    jobs, ids = {}, count(1)

    def answer(method, url, json=None, headers=None, timeout=None):
        assert headers == {"Authorization": "Bearer client-key"}
        response = mock.Mock(status_code=200)
        if method == "POST":
            job_id = f"job{next(ids)}"
            jobs[job_id] = {"status": "queued", "media_url": json["media_url"], "vtt": "", "language": "", "error": ""}
            response.json.return_value = {"id": job_id, "status": "queued"}
        else:
            job = jobs.get(url.rsplit("/", 1)[1])
            response.status_code = 200 if job else 404
            response.json.return_value = job
        return response

    with mock.patch("apps.courses.captions.requests.request", side_effect=answer) as request:
        request.jobs = jobs
        yield request


@pytest.fixture()
def video(tenant_ctx):
    return Video.objects.create(title="Lesson", s3_key=build_s3_path("videos", "lesson.mp4"))


def _finish(scribe, job_id, **fields):
    scribe.jobs[job_id].update(fields)
    sweep_captions()


@pytest.mark.django_db(transaction=True)
class TestSweep:
    def test_a_new_file_is_sent_once_and_its_captions_collected(self, scribe, video):
        sweep_captions()
        sweep_captions()  # still running: not sent again
        assert list(scribe.jobs) == ["job1"]
        assert video.s3_key in scribe.jobs["job1"]["media_url"]
        video.refresh_from_db()
        assert (video.captions_job, video.has_captions) == ("job1", False)

        _finish(scribe, "job1", status="done", vtt=VTT, language="tr")
        video.refresh_from_db()
        assert (video.captions_vtt, video.captions_language, video.captions_job) == (VTT, "tr", "")
        assert video.has_captions

    def test_a_replaced_file_loses_its_captions_until_transcribed_again(self, scribe, video):
        sweep_captions()
        _finish(scribe, "job1", status="done", vtt=VTT, language="tr")
        Video.objects.filter(pk=video.pk).update(s3_key=build_s3_path("videos", "take-2.mp4"))
        video.refresh_from_db()
        assert not video.has_captions
        sweep_captions()
        assert "take-2.mp4" in scribe.jobs["job2"]["media_url"]

    def test_a_failed_job_leaves_no_captions_and_is_not_resent(self, scribe, video):
        sweep_captions()
        _finish(scribe, "job1", status="failed", error="no audio stream")
        sweep_captions()
        video.refresh_from_db()
        assert (video.captions_job, video.has_captions, list(scribe.jobs)) == ("", False, ["job1"])

    def test_a_job_scribe_lost_is_sent_again(self, scribe, video):
        sweep_captions()
        scribe.jobs.clear()
        sweep_captions()  # 404: forgotten
        sweep_captions()
        assert list(scribe.jobs) == ["job2"]

    def test_only_her_own_files_and_recordings(self, scribe, tenant_ctx):
        Video.objects.create(title="Demo", s3_key="demo/videos/flow.mp4")
        Video.objects.create(title="Replay", s3_key="recordings/live/contentor/x-1/a.mp4")
        sweep_captions()
        assert [job["media_url"].split("?")[0].rsplit("/", 1)[1] for job in scribe.jobs.values()] == ["a.mp4"]

    def test_off_without_scribe_and_quiet_when_it_is_down(self, settings, video):
        settings.SCRIBE_URL = ""
        sweep_captions()  # nothing to call
        settings.SCRIBE_URL = "http://scribe-api:8000"
        with mock.patch("apps.courses.captions.requests.request", side_effect=requests.ConnectionError("down")):
            sweep_captions()
        video.refresh_from_db()
        assert video.captions_key == ""


@pytest.mark.django_db(transaction=True)
class TestWords:
    def test_the_words_come_with_the_captions(self, scribe, video):
        sweep_captions()
        _finish(scribe, "job1", status="done", vtt=VTT, language="tr", words=WORDS)
        video.refresh_from_db()
        assert (video.captions_words, video.has_words) == (WORDS, True)
        Video.objects.filter(pk=video.pk).update(s3_key=build_s3_path("videos", "take-2.mp4"))
        video.refresh_from_db()
        assert not video.has_words  # a new file's words are not these

    def test_captions_made_without_words_give_their_words_without_scribe(self, scribe, video):
        vtt = (
            "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nBu da\niyi.\n\n"
            "01:00:04.500 --> 01:00:05.500 align:start\nHadi.\n"
        )
        Video.objects.filter(pk=video.pk).update(captions_key=video.s3_key, captions_vtt=vtt, captions_language="tr")
        video.refresh_from_db()
        assert captions.ensure_words(video) == "ready"
        assert scribe.jobs == {}  # a file is transcribed once
        video.refresh_from_db()
        assert video.captions_words == [
            [1.0, 1.5, " Bu"],
            [1.5, 2.0, " da"],
            [2.0, 3.0, " iyi."],
            [3604.5, 3605.5, " Hadi."],
        ]

    def test_a_new_file_is_sent_now_rather_than_at_the_next_sweep(self, scribe, video):
        assert captions.ensure_words(video) == "working"
        assert list(scribe.jobs) == ["job1"]

    def test_none_for_the_demo_footage_without_scribe_or_without_speech(self, scribe, settings, video):
        demo = Video.objects.create(title="Demo", s3_key="demo/videos/flow.mp4")
        assert captions.ensure_words(demo) == "unavailable"
        Video.objects.filter(pk=video.pk).update(captions_key=video.s3_key)  # done, no captions: no speech
        video.refresh_from_db()
        assert captions.ensure_words(video) == "failed"
        settings.SCRIBE_URL = ""
        assert captions.ensure_words(video) == "unavailable"
        assert scribe.jobs == {}


@pytest.mark.django_db(transaction=True)
class TestPlayerCaptions:
    @pytest.fixture()
    def lesson(self, tenant_ctx, video):
        owner = User.objects.create_user(email="owner@captions.test", name="O", password="x", role="owner")
        course = Course.objects.create(
            title="Paid",
            slug="paid-course",
            instructor=owner,
            pricing_type="paid",
            price=Decimal("20"),
            is_published=True,
        )
        module = Module.objects.create(course=course, title="M", order=1)
        Video.objects.filter(pk=video.pk).update(captions_key=video.s3_key, captions_vtt=VTT, captions_language="tr")
        return Lesson.objects.create(module=module, title="L", order=1, video=video)

    def test_the_coach_gets_the_track_and_the_vtt(self, lesson):
        coach = User.objects.create_user(email="coach@captions.test", name="C", password="x", role="coach")
        client = make_client(coach)
        data = client.get("/api/v1/courses/paid-course/").json()
        found = data["modules"][0]["lessons"][0]
        assert found["captions_url"] == f"/api/v1/courses/paid-course/lessons/{lesson.id}/captions/"
        assert found["captions_language"] == "tr"
        response = client.get(found["captions_url"])
        assert response.status_code == 200
        assert response["Content-Type"] == "text/vtt; charset=utf-8"
        assert response.content.decode() == VTT

    def test_a_student_without_the_course_gets_neither(self, lesson):
        student = User.objects.create_user(email="student@captions.test", name="S", password="x", role="student")
        client = make_client(student)
        found = client.get("/api/v1/courses/paid-course/").json()["modules"][0]["lessons"][0]
        assert (found["captions_url"], found["captions_language"]) == (None, "")
        assert client.get(f"/api/v1/courses/paid-course/lessons/{lesson.id}/captions/").status_code == 404
        assert make_client().get(f"/api/v1/courses/paid-course/lessons/{lesson.id}/captions/").status_code in (401, 403)

    def test_the_coach_sees_where_her_captions_stand(self, settings, lesson, video):
        settings.SCRIBE_URL = "http://scribe-api:8000"
        coach = User.objects.create_user(email="coach2@captions.test", name="C", password="x", role="coach")
        student = User.objects.create_user(email="student2@captions.test", name="S", password="x", role="student")

        def seen(user):
            data = make_client(user).get("/api/v1/courses/paid-course/").json()
            return data["modules"][0]["lessons"][0]["captions_status"]

        assert (seen(coach), seen(student)) == ("ready", None)
        Video.objects.filter(pk=video.pk).update(captions_vtt="", captions_job="job1")
        assert seen(coach) == "working"
        Video.objects.filter(pk=video.pk).update(captions_job="")
        assert seen(coach) == "failed"
        Video.objects.filter(pk=video.pk).update(s3_key=build_s3_path("videos", "take-2.mp4"))
        assert seen(coach) == "waiting"
        Video.objects.filter(pk=video.pk).update(s3_key="demo/videos/flow.mp4")
        assert seen(coach) is None
        settings.SCRIBE_URL = ""
        Video.objects.filter(pk=video.pk).update(s3_key=build_s3_path("videos", "take-2.mp4"))
        assert seen(coach) is None
