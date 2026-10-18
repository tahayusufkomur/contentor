"""focus_timing: focus mode's active time to a complete course draft against
the plain form's, per mode (spec §6 item 6)."""

from apps.tenant_config.management.commands.focus_timing import summarize


def test_summarize_medians_complete_rows_per_mode():
    rows = [
        {"mode": "focus", "active_ms": 60000, "complete": True},
        {"mode": "focus", "active_ms": 120000, "complete": True},
        {"mode": "focus", "active_ms": 10000, "complete": False},
        {"mode": "form", "active_ms": 300000, "complete": True},
    ]
    assert summarize(rows) == {
        "focus": {"count": 3, "complete": 2, "median_ms": 90000},
        "form": {"count": 1, "complete": 1, "median_ms": 300000},
    }


def test_a_mode_with_no_complete_row_has_no_median():
    assert summarize([{"mode": "form", "active_ms": 5, "complete": False}]) == {
        "form": {"count": 1, "complete": 0, "median_ms": None}
    }
