import pytest

from apps.core.models import PlatformKbEntry
from apps.tenant_config import help_bot

pytestmark = pytest.mark.django_db


@pytest.fixture()
def tenant(tenant_ctx):
    return tenant_ctx


@pytest.fixture()
def config(tenant_ctx):
    from apps.tenant_config.models import TenantConfig

    return TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Test Brand")


def test_addenda_appended_per_audience_without_restart():
    base = help_bot.system_prompt("coach")
    assert "PLATFORM NOTES" not in base
    PlatformKbEntry.objects.create(
        audience="coach", title="AI blog quota", content="Starter includes 5 AI blog posts/month; Pro 30."
    )
    PlatformKbEntry.objects.create(audience="visitor", title="V", content="visitor-only")
    PlatformKbEntry.objects.create(audience="all", title="Both", content="applies to both")
    coach = help_bot.system_prompt("coach")
    assert "AI blog quota" in coach and "applies to both" in coach and "visitor-only" not in coach
    visitor = help_bot.system_prompt("visitor")
    assert "visitor-only" in visitor and "AI blog quota" not in visitor


def test_disabled_and_ordering():
    PlatformKbEntry.objects.create(audience="coach", title="B", content="second", position=2)
    PlatformKbEntry.objects.create(audience="coach", title="A", content="first", position=1)
    # "hidden" would collide with real help_kb.md prose ("site hidden from
    # students until republished") — use a marker guaranteed absent from the KB.
    PlatformKbEntry.objects.create(audience="coach", title="Off", content="SECRET_DISABLED_MARKER", enabled=False)
    prompt = help_bot.system_prompt("coach")
    assert "SECRET_DISABLED_MARKER" not in prompt and prompt.index("first") < prompt.index("second")


def test_edit_changes_prompt_bytes():
    e = PlatformKbEntry.objects.create(audience="coach", title="T", content="v1")
    p1 = help_bot.system_prompt("coach")
    e.content = "v2"
    e.save()
    p2 = help_bot.system_prompt("coach")
    assert "v1" in p1 and "v2" in p2


def test_same_state_returns_cached_object_not_rebuilt():
    """Two calls with no DB change in between must be a genuine cache hit
    (same object), not just equal content — proves the prompt bytes served
    to Anthropic are byte-identical (and cache-prefix-stable) between calls."""
    PlatformKbEntry.objects.create(audience="coach", title="X", content="x")
    p1 = help_bot.system_prompt("coach")
    p2 = help_bot.system_prompt("coach")
    assert p1 is p2


def test_unrelated_audience_change_does_not_invalidate_other_audience_cache():
    """Editing coach-only addenda must not force a visitor-prompt rebuild —
    each audience's fingerprint (and therefore its Anthropic cache prefix)
    is independent."""
    visitor_before = help_bot.system_prompt("visitor")
    PlatformKbEntry.objects.create(audience="coach", title="Coach only", content="coach-only-note")
    visitor_after = help_bot.system_prompt("visitor")
    assert visitor_before is visitor_after


def test_student_bot_gets_student_notes(tenant, config):
    from apps.tenant_config import student_bot

    PlatformKbEntry.objects.create(audience="student", title="Policy", content="Never discuss other coaches.")
    prompt, _ = student_bot.build_system_prompt(tenant, config)
    assert "Never discuss other coaches." in prompt
    # The persona's Rules text itself mentions the literal string
    # "<site_knowledge>" (describing the tag), so the FIRST occurrence in the
    # prompt is that prose, not the pack's opening tag. rindex() finds the
    # real opening tag (the last occurrence) — the notes must precede that.
    assert prompt.index("Never discuss other coaches.") < prompt.rindex("<site_knowledge>")
