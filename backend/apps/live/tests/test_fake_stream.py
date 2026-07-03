from django.test import SimpleTestCase, override_settings

from apps.live import stream_service


@override_settings(LIVE_FAKE_ENABLED=True, GETSTREAM_API_KEY="")
class FakeStreamTests(SimpleTestCase):
    def test_token_is_deterministic_and_offline(self):
        assert stream_service.generate_user_token(42) == "fake-token-u42"

    def test_api_key_reports_fake(self):
        assert stream_service.api_key() == "fake-local"

    def test_lifecycle_functions_are_noops(self):
        class Obj:
            room_name = "room-1"
            auto_recording = False

        class U:
            id = 1
            name = "n"
            email = "e@example.com"
            avatar_url = ""
            role = "coach"

        stream_service.upsert_user(U())
        assert stream_service.create_call(Obj(), U()) is None
        stream_service.stop_call("room-1")
        assert stream_service.create_livestream(Obj(), U()) is None
        stream_service.stop_livestream("room-1")


@override_settings(LIVE_FAKE_ENABLED=False, GETSTREAM_API_KEY="k_real")  # pragma: allowlist secret
class RealStreamKeyTests(SimpleTestCase):
    def test_api_key_reports_real_key(self):
        assert stream_service.api_key() == "k_real"
