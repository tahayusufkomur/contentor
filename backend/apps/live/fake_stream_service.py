"""Offline stand-in for GetStream. Active only when settings.LIVE_FAKE_ENABLED.

Create/join/stop live classes works end-to-end without network; the browser
video canvas itself cannot connect (no real Stream backend) — UI is testable
up to the join screen.
"""
import logging

logger = logging.getLogger(__name__)


def _user_id(pk):
    return f"u{pk}"


def upsert_user(user):
    logger.info("[fake-stream] upsert_user %s", _user_id(user.id))


def create_call(live_class, instructor):
    logger.info("[fake-stream] create_call %s", live_class.room_name)
    return None


def stop_call(room_name):
    logger.info("[fake-stream] stop_call %s", room_name)


def create_livestream(live_stream, instructor):
    logger.info("[fake-stream] create_livestream %s", live_stream.room_name)
    return None


def stop_livestream(room_name):
    logger.info("[fake-stream] stop_livestream %s", room_name)


def generate_user_token(user_id):
    return f"fake-token-{_user_id(user_id)}"
