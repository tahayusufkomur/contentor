# backend/apps/logbook/context.py
"""Who caused this log line?

`TenantJWTAuthentication` calls `set_current_user()` on success (DRF resolves
the JWT at view level, so middleware alone can never see it), the logging
filter stamps every record, and `UserContextMiddleware` resets the var when
the request ends — gthread workers reuse threads, so without the reset a
line logged between requests would carry the previous user."""

from __future__ import annotations

import logging
from contextvars import ContextVar

_current_user: ContextVar[str] = ContextVar("logbook_user", default="-")


def set_current_user(label: str) -> None:
    _current_user.set(label or "-")


def get_current_user() -> str:
    return _current_user.get()


def reset_current_user() -> None:
    _current_user.set("-")


class UserContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.user = get_current_user()
        except Exception:  # noqa: BLE001 — never let logging raise
            record.user = "-"
        return True


class UserContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        finally:
            reset_current_user()
