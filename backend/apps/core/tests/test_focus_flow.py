"""Focus mode's question flow: a creation in progress (FocusCreation), the
course recipe's questions in order, and the draft course behind them. The
outline job is stubbed; it is tested in test_focus_outline.py."""

import pytest

from apps.tenant_config.models import FocusCreation

pytestmark = pytest.mark.django_db(transaction=True)


def test_a_creation_starts_active_and_empty(tenant_ctx):
    creation = FocusCreation.objects.create(kind="course")
    assert creation.status == "active"
    assert creation.answers == {}
    assert creation.active_ms == 0
    assert creation.mode == "focus"
    assert creation.outline_run is None
