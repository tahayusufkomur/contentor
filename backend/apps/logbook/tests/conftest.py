# backend/apps/logbook/tests/conftest.py
"""Log-capture fixtures. caplog cannot be used for apps.logbook.* loggers:
the `apps` logger has propagate=False, so records never reach the root
logger where caplog listens. These fixtures attach a handler directly to
the emitting logger."""

from __future__ import annotations

import logging

import pytest


class CaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.messages: list[str] = []
        self.records: list[logging.LogRecord] = []

    def emit(self, record):
        self.records.append(record)
        self.messages.append(record.getMessage())


def _capture(logger_name):
    handler = CaptureHandler()
    logger = logging.getLogger(logger_name)
    old_level = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield handler
    finally:
        logger.removeHandler(handler)
        logger.setLevel(old_level)


@pytest.fixture()
def activity_capture():
    yield from _capture("apps.logbook.activity")


@pytest.fixture()
def tasks_capture():
    yield from _capture("apps.logbook.tasks")
