"""The kinds focus mode can make, each behind its adapter module: its recipe,
its draft record and how that record is priced, checked and put live. The
flow (apps.core.focus.flow) asks ``get(creation.kind)`` for all of it, so
nothing in the flow names a kind. ``FOCUS_KINDS`` turns each one on."""

from importlib import import_module
from types import ModuleType

from django.conf import settings

KINDS: dict[str, str] = {"course": "apps.core.focus.kinds.course"}


def get(kind: str) -> ModuleType:
    from ..flow import FlowError

    if kind not in KINDS:
        raise FlowError("unknown_kind")
    return import_module(KINDS[kind])


def enabled() -> list[str]:
    """The kinds switched on, in ``KINDS`` order."""
    return [kind for kind in KINDS if kind in settings.FOCUS_KINDS]
