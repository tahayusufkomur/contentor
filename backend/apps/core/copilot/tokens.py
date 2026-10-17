"""Single-use signed action tokens.

The converse endpoint proposes actions; nothing executes until the coach
confirms. The proposal payload (which can embed a full recomposed pages tree)
is cached server-side under a fresh jti; the client only ever holds a small
JWT. take_action pops the cache entry, so a token works exactly once."""

from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from django.conf import settings
from django.core.cache import cache

_PURPOSE = "copilot_action"
_KEY = "copilot:action:{jti}"


# How long a minted card stays usable. A streamed turn's cards live while its
# chat is open; a run's reply can be opened for a day ("ready for you"), so
# runs mint inside lasting() for that long.
_TTL = ContextVar("copilot_token_ttl", default=1800)


class ActionTokenError(Exception):
    pass


@contextmanager
def lasting(seconds):
    """Cards minted inside this block stay usable for ``seconds``."""
    reset = _TTL.set(seconds)
    try:
        yield
    finally:
        _TTL.reset(reset)


def stash_action(tenant_schema, action, ttl=None):
    ttl = ttl or _TTL.get()
    jti = uuid4().hex
    cache.set(_KEY.format(jti=jti), action, timeout=ttl)
    payload = {
        "jti": jti,
        "schema": tenant_schema,
        "purpose": _PURPOSE,
        "exp": datetime.now(tz=UTC) + timedelta(seconds=ttl),
        "iat": datetime.now(tz=UTC),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def take_action(token, tenant_schema):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ActionTokenError("invalid action token") from exc
    if payload.get("purpose") != _PURPOSE or payload.get("schema") != tenant_schema:
        raise ActionTokenError("invalid action token")
    key = _KEY.format(jti=payload["jti"])
    action = cache.get(key)
    if action is None:
        raise ActionTokenError("action expired or already executed")
    if not cache.delete(key):
        raise ActionTokenError("action expired or already executed")
    return action
