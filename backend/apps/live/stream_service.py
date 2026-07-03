import logging

from django.conf import settings
from getstream import Stream
from getstream.models import (
    CallRequest,
    CallSettingsRequest,
    MemberRequest,
    RecordSettingsRequest,
    UserRequest,
)

from . import fake_stream_service

logger = logging.getLogger(__name__)


def _fake():
    return bool(settings.LIVE_FAKE_ENABLED)


def api_key():
    """Publishable key for browser SDKs; sentinel when running the fake."""
    return "fake-local" if _fake() else settings.GETSTREAM_API_KEY


def _user_id(pk):
    """GetStream requires user IDs >= 2 chars. Prefix with 'u' to be safe."""
    return f"u{pk}"


def get_client():
    return Stream(
        api_key=settings.GETSTREAM_API_KEY,
        api_secret=settings.GETSTREAM_API_SECRET,
    )


def upsert_user(user):
    if _fake():
        return fake_stream_service.upsert_user(user)
    client = get_client()
    client.upsert_users(
        UserRequest(
            id=_user_id(user.id),
            name=user.name or user.email,
            role="user",
            image=user.avatar_url or "",
            custom={"email": user.email, "django_role": user.role},
        ),
    )


def create_call(live_class, instructor):
    if _fake():
        return fake_stream_service.create_call(live_class, instructor)
    client = get_client()
    call = client.video.call("default", live_class.room_name)

    upsert_user(instructor)

    recording_mode = "auto-on" if live_class.auto_recording else "available"

    call.get_or_create(
        data=CallRequest(
            created_by_id=_user_id(instructor.id),
            members=[
                MemberRequest(user_id=_user_id(instructor.id), role="host"),
            ],
            settings_override=CallSettingsRequest(
                recording=RecordSettingsRequest(
                    mode=recording_mode,
                    quality="1080p",
                ),
            ),
        ),
    )

    return call


def stop_call(room_name):
    if _fake():
        return fake_stream_service.stop_call(room_name)
    client = get_client()
    call = client.video.call("default", room_name)
    try:
        call.stop_recording()
    except Exception:
        logger.warning("Failed to stop recording for %s (may not have been recording)", room_name)
    try:
        call.end()
    except Exception:
        logger.exception("Failed to end call for %s", room_name)


def create_livestream(live_stream, instructor):
    """Create a GetStream livestream call (broadcast mode)."""
    if _fake():
        return fake_stream_service.create_livestream(live_stream, instructor)
    client = get_client()
    call = client.video.call("livestream", live_stream.room_name)

    upsert_user(instructor)

    recording_mode = "auto-on" if live_stream.auto_recording else "available"

    call.get_or_create(
        data=CallRequest(
            created_by_id=_user_id(instructor.id),
            members=[
                MemberRequest(user_id=_user_id(instructor.id), role="host"),
            ],
            settings_override=CallSettingsRequest(
                recording=RecordSettingsRequest(
                    mode=recording_mode,
                    quality="1080p",
                ),
            ),
        ),
    )

    # Go live (enable backstage → live)
    call.go_live()

    return call


def stop_livestream(room_name):
    if _fake():
        return fake_stream_service.stop_livestream(room_name)
    client = get_client()
    call = client.video.call("livestream", room_name)
    try:
        call.stop_recording()
    except Exception:
        logger.warning("Failed to stop recording for livestream %s", room_name)
    try:
        call.stop_live()
    except Exception:
        logger.warning("Failed to stop live for %s", room_name)
    try:
        call.end()
    except Exception:
        logger.exception("Failed to end livestream %s", room_name)


def generate_user_token(user_id):
    if _fake():
        return fake_stream_service.generate_user_token(user_id)
    client = get_client()
    return client.create_token(user_id=_user_id(user_id))
