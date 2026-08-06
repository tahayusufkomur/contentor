"""run_turn: model union in, executable proposal cards out. The model is
always mocked — these tests pin the post-processing contract."""

from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest
from django.utils import timezone

from apps.core.copilot import blocks, engine

pytestmark = pytest.mark.django_db

TENANT = SimpleNamespace(schema_name="demo_yoga", name="Demo Yoga", wizard_state={"answers": {"niche": "yoga"}})


@pytest.fixture()
def tenant_with_pages(tenant_ctx):
    """A real tenant (real schema, so _tenant_pages' tenant_context switch
    actually resolves) with one TenantConfig.pages block to validate
    field-edit/toggle/duplicate cards against."""
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Test Brand")
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    tenant_ctx.wizard_state = {"answers": {"niche": "yoga"}}
    return tenant_ctx


def _turn(**kw):
    return engine.CopilotTurn.model_validate(kw)


def _run(parsed):
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
        mock.patch.object(engine.site_ai, "preview_edit", return_value=({"home": []}, {}, Decimal("0"))),
        mock.patch.object(
            engine.site_ai,
            "diff_current",
            return_value=[{"page": "home", "block_type": "hero", "field": "heading", "old": "a", "new": "b"}],
        ),
    ):
        return engine.run_turn(TENANT, [], [], "hi")


def test_answer_and_ask_pass_through():
    payload, cost = _run(_turn(kind="answer", text="You can sell courses."))
    assert payload == {"kind": "answer", "text": "You can sell courses."}
    assert cost == Decimal("0.01")
    payload, _ = _run(_turn(kind="ask", text="Warmer how — colors or copy?"))
    assert payload["kind"] == "ask"


def test_edit_pages_action_becomes_card_with_changes_and_token():
    parsed = _turn(
        kind="actions", text="Here's my plan", actions=[{"kind": "edit_pages", "instruction": "warmer hero"}]
    )
    with (
        mock.patch.object(engine.site_ai, "preview_edit", return_value=({"home": []}, {}, Decimal("0"))),
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
        mock.patch.object(
            engine.site_ai,
            "diff_current",
            return_value=[{"page": "home", "field": "heading", "block_type": "hero", "old": "a", "new": "b"}],
        ),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "make it warmer")
    (card,) = payload["actions"]
    assert card["kind"] == "edit_pages" and card["changes"][0]["new"] == "b"
    assert card["token"]  # stashed and executable


def test_add_block_card_carries_the_built_block():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "add_block", "page": "home", "block_type": "cta", "fields": {"heading": "Join us"}}],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "add a call to action")
    (card,) = payload["actions"]
    assert card["kind"] == "add_block" and "Join us" in card["detail"]


def test_invalid_actions_are_dropped_and_fallback_answer_returned():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "add_block", "page": "home", "block_type": "testimonials", "fields": {}}],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "add testimonials")
    assert payload["kind"] == "answer"  # nothing proposable survived


def test_failed_model_call_still_reports_cost():
    from apps.core.ai import AiError

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=AiError("boom", cost_usd=Decimal("0.004"))),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
        pytest.raises(AiError),
    ):
        engine.run_turn(TENANT, [], [], "hi")


def test_create_course_action_becomes_card_with_stashed_params():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_course",
                "title": "Yoga Foundations",
                "description": "Start here.",
                "price": 49,
                "modules": [{"title": "Basics", "lessons": ["Breathing", "Posture"]}],
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "create my first course")
    (card,) = payload["actions"]
    assert card["kind"] == "create_course"
    assert "Yoga Foundations" in card["title"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["params"]["pricing_type"] == "paid"
    assert stashed["params"]["price"] == "49.00"
    assert stashed["params"]["modules"][0]["lessons"] == [{"title": "Breathing"}, {"title": "Posture"}]
    assert "is_published" not in stashed["params"]


def test_create_event_card_requires_future_date():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_event",
                "event_kind": "live",
                "title": "Morning flow",
                "scheduled_at": "2020-01-01T09:00:00Z",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "schedule a class")
    assert payload["kind"] == "answer"  # past-date proposal dropped, fallback answer


def test_create_event_onsite_card_stashes_location_and_kind():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_event",
                "event_kind": "onsite",
                "title": "Berlin retreat",
                "location": "Studio Mitte",
                "scheduled_at": "2030-06-01T10:00:00Z",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "plan a retreat")
    (card,) = payload["actions"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["event_kind"] == "onsite"
    assert stashed["params"]["location"] == "Studio Mitte"
    assert stashed["params"]["scheduled_at"].startswith("2030-06-01")


def test_create_blog_post_card_maps_summary_to_excerpt():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_blog_post",
                "title": "5 stretches",
                "summary": "A five-minute routine.",
                "body_html": "<p>Go.</p>",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "write a blog post")
    (card,) = payload["actions"]
    assert card["kind"] == "create_blog_post"
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["params"]["excerpt"] == "A five-minute routine."
    assert "status" not in stashed["params"]


def test_system_prompt_lists_draft_announcement():
    assert "draft_announcement" in engine.SYSTEM_PROMPT
    assert "you can never send anything yourself" in engine.SYSTEM_PROMPT


def test_draft_announcement_card_maps_params_and_states_inert_detail():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "draft_announcement",
                "title": "New timetable",
                "body_html": "<p>From Monday…</p>",
                "link": "/courses",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "tell students about the new timetable")
    (card,) = payload["actions"]
    assert card["kind"] == "draft_announcement"
    assert card["detail"] == "Saved as a draft — review and send it from Announcements. Nothing is sent now."
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["params"]["title"] == "New timetable"
    assert stashed["params"]["link"] == "/courses"


def test_edit_theme_card_stashes_normalized_theme():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(kind="actions", text="", actions=[{"kind": "edit_theme", "theme": "Forest"}])
    payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "edit_theme"
    assert "Forest" in card["title"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {"kind": "edit_theme", "theme": "forest"}


def test_edit_theme_unknown_id_dropped_with_fallback():
    parsed = _turn(kind="actions", text="", actions=[{"kind": "edit_theme", "theme": "midnight"}])
    payload, _ = _run(parsed)
    assert payload["kind"] == "answer"  # unknown theme dropped, fallback answer


def test_edit_navbar_card_carries_layout_and_cta():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_navbar", "layout": "pill", "cta_text": "Join now", "cta_href": "/plans"}],
    )
    payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "edit_navbar"
    assert "pill" in card["detail"] and "Join now" in card["detail"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {
        "kind": "edit_navbar",
        "updates": {"layout": "pill", "cta": {"text": "Join now", "href": "/plans"}},
    }


def test_edit_navbar_without_changes_dropped():
    parsed = _turn(kind="actions", text="", actions=[{"kind": "edit_navbar"}])
    payload, _ = _run(parsed)
    assert payload["kind"] == "answer"  # nothing to change, dropped


def test_user_turn_includes_chrome_digest():
    from decimal import Decimal

    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="answer", text="hi"), Decimal("0.01"), "m"

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        engine.run_turn(TENANT, [], [], "hello")
    assert "Theme: ocean" in captured["user"]


def test_system_prompt_carries_platform_knowledge_and_addenda():
    from decimal import Decimal

    from apps.core.models import PlatformKbEntry

    PlatformKbEntry.objects.create(title="Fees", content="COPILOT-KB-MARKER fee note", audience="coach")
    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="answer", text="hi"), Decimal("0.01"), "m"

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        engine.run_turn(TENANT, [], [], "how do I get paid?")
    assert captured["system"].startswith(engine.SYSTEM_PROMPT)
    assert "# PLATFORM KNOWLEDGE" in captured["system"]
    assert "COPILOT-KB-MARKER fee note" in captured["system"]


def test_ask_over_cap_is_steered_and_coerced_to_answer():
    from decimal import Decimal

    from apps.core.models import CopilotSettings

    s = CopilotSettings.load()
    s.max_asks_per_conversation = 1
    s.save()
    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="ask", text="Which page do you mean?"), Decimal("0.01"), "m"

    transcript = [
        {"role": "coach", "text": "improve my site"},
        {"role": "assistant", "text": "What look do you want?", "kind": "ask"},
    ]
    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, transcript, [], "warmer")
    assert payload == {"kind": "answer", "text": "Which page do you mean?"}
    assert "Do not ask another clarifying question" in captured["user"]


def test_cap_zero_leaves_asks_uncapped():
    from decimal import Decimal

    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="ask", text="Which page?"), Decimal("0.01"), "m"

    transcript = [{"role": "assistant", "text": "Earlier question?", "kind": "ask"}]
    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, transcript, [], "hi")
    assert payload["kind"] == "ask"  # default cap 0 = today's behavior
    assert "Do not ask another clarifying question" not in captured["user"]


def test_ask_outside_transcript_window_does_not_trip_cap():
    """An 'ask' entry older than MAX_TRANSCRIPT turns is outside the window
    the model actually sees this turn — it must not count toward the cap,
    or the coach gets steered based on history the model has no visibility
    into (see engine._asks_so_far / _user_turn window drift)."""
    from decimal import Decimal

    from apps.core.models import CopilotSettings

    s = CopilotSettings.load()
    s.max_asks_per_conversation = 1
    s.save()
    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="ask", text="Which page do you mean?"), Decimal("0.01"), "m"

    # One real "ask" turn, then enough filler turns to push it outside the
    # trailing MAX_TRANSCRIPT window _user_turn/_asks_so_far now share.
    old_ask = [{"role": "assistant", "text": "Old question?", "kind": "ask"}]
    filler = [{"role": "coach", "text": f"filler {i}"} for i in range(engine.MAX_TRANSCRIPT)]
    transcript = old_ask + filler
    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, transcript, [], "warmer")
    assert payload["kind"] == "ask"  # old ask is outside the window, so cap doesn't trip
    assert "Do not ask another clarifying question" not in captured["user"]
    assert "Old question?" not in captured["user"]  # confirms it's actually outside the window


def test_under_cap_ask_passes_through():
    from decimal import Decimal

    from apps.core.models import CopilotSettings

    s = CopilotSettings.load()
    s.max_asks_per_conversation = 2
    s.save()

    def fake_structured(**kw):
        return _turn(kind="ask", text="Which page?"), Decimal("0.01"), "m"

    transcript = [{"role": "assistant", "text": "Earlier question?", "kind": "ask"}]
    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        payload, _ = engine.run_turn(TENANT, transcript, [], "hi")
    assert payload["kind"] == "ask"  # 1 prior ask < cap of 2


def test_set_block_image_card_stashes_pick_and_carries_preview():
    from apps.core.copilot import photos as copilot_photos
    from apps.core.copilot import tokens as copilot_tokens

    row = SimpleNamespace(pk=7, title="Sunlit yoga studio", image_key="platform/curated-photos/sun.jpg")
    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {"kind": "set_block_image", "page": "home", "block_id": "blk_hero", "description": "calm sunlit studio"}
        ],
    )
    with (
        mock.patch.object(engine, "_block_for_image", return_value=("bgImage", None)) as block_lookup,
        mock.patch.object(copilot_photos, "pick_photo", return_value=row) as pick,
        mock.patch.object(copilot_photos, "preview_url", return_value="https://cdn.example/sun.jpg"),
    ):
        payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "set_block_image"
    assert "Sunlit yoga studio" in card["title"]
    assert card["image_url"] == "https://cdn.example/sun.jpg"
    block_lookup.assert_called_once_with(TENANT, "home", "blk_hero")
    assert pick.call_args.kwargs["field"] == "bgImage"
    assert pick.call_args.kwargs["exclude_s3_key"] is None
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {
        "kind": "set_block_image",
        "page": "home",
        "block_id": "blk_hero",
        "field": "bgImage",
        "curated_photo_id": 7,
    }


def test_set_block_image_unknown_block_dropped_with_fallback():
    from apps.core.copilot import photos as copilot_photos

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "set_block_image", "page": "home", "block_id": "blk_nope", "description": "x"}],
    )
    with mock.patch.object(
        engine, "_block_for_image", side_effect=copilot_photos.PhotoOpError("no block blk_nope on home")
    ):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"  # bad block id dropped, fallback answer


def test_all_cards_dropped_never_echoes_success_claiming_text():
    from apps.core.copilot import photos as copilot_photos

    parsed = _turn(
        kind="actions",
        text="Added a calming yoga-studio photo to your homepage hero!",
        actions=[{"kind": "set_block_image", "page": "home", "block_id": "blk_hero", "description": "calm"}],
    )
    with (
        mock.patch.object(engine, "_block_for_image", return_value=("bgImage", None)),
        mock.patch.object(
            copilot_photos,
            "pick_photo",
            side_effect=copilot_photos.PhotoOpError("no photos are available in the library yet"),
        ),
    ):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"
    # The model's narration claims success for actions that were dropped —
    # it must never reach the coach.
    assert "Added a calming" not in payload["text"]
    assert "no photos are available in the library yet" in payload["text"]


def test_system_prompt_contains_field_guide_and_new_actions():
    assert "edit_block_fields" in engine.SYSTEM_PROMPT
    assert "toggle_block" in engine.SYSTEM_PROMPT
    assert "duplicate_block" in engine.SYSTEM_PROMPT
    assert "stats" in engine.SYSTEM_PROMPT and "banner" in engine.SYSTEM_PROMPT
    assert "overlay(none|dark|light)" in engine.SYSTEM_PROMPT  # generated FIELD GUIDE


def test_edit_block_fields_card_carries_diff_rows(tenant_with_pages):
    action = engine.EditBlockFieldsAction(
        kind="edit_block_fields",
        page="home",
        block_id="blk_hero",
        fields={"heading": "New headline"},
    )
    card = engine._card(tenant_with_pages, action)
    assert card["kind"] == "edit_block_fields"
    assert card["changes"][0]["field"] == "heading"
    assert card["changes"][0]["new"] == "New headline"
    assert card["token"]


def test_toggle_and_duplicate_cards_validate_against_current_pages(tenant_with_pages):
    toggle = engine.ToggleBlockAction(kind="toggle_block", page="home", block_id="blk_hero", enabled=False)
    assert engine._card(tenant_with_pages, toggle)["kind"] == "toggle_block"
    dup = engine.DuplicateBlockAction(kind="duplicate_block", page="home", block_id="blk_missing")
    with pytest.raises(blocks.BlockOpError):
        engine._card(tenant_with_pages, dup)


def test_navbar_card_with_links_and_flags(tenant_with_pages):
    action = engine.EditNavbarAction(
        kind="edit_navbar",
        links=[engine.NavLinkItem(label="Courses", href="/courses")],
        show_login=False,
    )
    card = engine._card(tenant_with_pages, action)
    assert "Courses" in card["detail"] and "login" in card["detail"].lower()


def test_pages_digest_lists_field_values_and_hidden_flag(tenant_with_pages):
    digest = engine._pages_digest(tenant_with_pages)
    assert 'heading="Hi"' in digest  # current values now visible to the model


def test_system_prompt_lists_set_course_cover():
    assert "set_course_cover" in engine.SYSTEM_PROMPT


def test_set_course_cover_card_stashes_pick_and_carries_preview():
    from apps.core.copilot import photos as copilot_photos
    from apps.core.copilot import tokens as copilot_tokens

    row = SimpleNamespace(pk=9, title="Golden-hour mat flow", image_key="platform/curated-photos/mat.jpg")
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "set_course_cover", "course_id": 3, "description": "energetic morning flow"}],
    )
    with (
        mock.patch.object(engine, "_course_for_cover", return_value=("Yoga Basics", None)) as course_lookup,
        mock.patch.object(copilot_photos, "pick_photo", return_value=row) as pick,
        mock.patch.object(copilot_photos, "preview_url", return_value="https://cdn.example/mat.jpg"),
    ):
        payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "set_course_cover"
    assert "Yoga Basics" in card["title"] and "Golden-hour mat flow" in card["title"]
    assert card["image_url"] == "https://cdn.example/mat.jpg"
    course_lookup.assert_called_once_with(TENANT, 3)
    assert pick.call_args.kwargs["field"] == "courseCover"
    assert pick.call_args.kwargs["exclude_s3_key"] is None
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {"kind": "set_course_cover", "course_id": 3, "curated_photo_id": 9}


def test_set_course_cover_unknown_course_dropped_with_reason():
    from apps.core.copilot import photos as copilot_photos

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "set_course_cover", "course_id": 999, "description": "x"}],
    )
    with mock.patch.object(
        engine, "_course_for_cover", side_effect=copilot_photos.PhotoOpError("no course with id 999")
    ):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"
    assert "no course with id 999" in payload["text"]


def test_system_prompt_lists_set_logo():
    assert "set_logo" in engine.SYSTEM_PROMPT


def test_set_logo_card_stashes_pick_and_carries_preview():
    from apps.core.copilot import logos as copilot_logos
    from apps.core.copilot import tokens as copilot_tokens

    row = SimpleNamespace(pk=11, title="Lotus mark", image_key="platform/curated-logos/lotus.png")
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "set_logo", "description": "a calm lotus flower"}],
    )
    with (
        mock.patch.object(copilot_logos, "current_logo_key", return_value=None) as current_key,
        mock.patch.object(copilot_logos, "pick_logo", return_value=row) as pick,
        mock.patch.object(copilot_logos, "preview_url", return_value="https://cdn.example/lotus.png"),
    ):
        payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "set_logo"
    assert "Lotus mark" in card["title"]
    assert card["image_url"] == "https://cdn.example/lotus.png"
    current_key.assert_called_once_with(TENANT)
    assert pick.call_args.args[0] == "a calm lotus flower"
    assert pick.call_args.kwargs["exclude_s3_key"] is None
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {"kind": "set_logo", "curated_logo_id": 11}


def test_set_logo_no_logos_dropped_with_fallback():
    from apps.core.copilot import logos as copilot_logos

    parsed = _turn(
        kind="actions",
        text="Set a fresh new logo for you!",
        actions=[{"kind": "set_logo", "description": "x"}],
    )
    with (
        mock.patch.object(copilot_logos, "current_logo_key", return_value=None),
        mock.patch.object(
            copilot_logos,
            "pick_logo",
            side_effect=copilot_logos.LogoOpError("no logos are available in the library yet"),
        ),
    ):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"
    assert "Set a fresh new logo" not in payload["text"]
    assert "no logos are available in the library yet" in payload["text"]


def test_set_logo_card_excludes_current_logo_and_picks_a_different_row(tenant_with_pages):
    """End-to-end (real pick_logo, not mocked): the tenant's current logo
    (materialized from catalog row A) must never be re-proposed — a
    "different style" ask has to actually change something."""
    from django_tenants.utils import schema_context

    from apps.core.copilot import logos as copilot_logos
    from apps.core.curated_logos.materialize import materialize_curated_logo
    from apps.core.models import CuratedLogo
    from apps.tenant_config.models import TenantConfig

    with schema_context("public"):
        row_a = CuratedLogo.objects.create(
            title="Lotus mark", tags="yoga,calm", image_key="platform/curated-logos/lotus.png", enabled=True
        )
        row_b = CuratedLogo.objects.create(
            title="Mountain mark", tags="yoga,calm", image_key="platform/curated-logos/mountain.png", enabled=True
        )
    photo_a = materialize_curated_logo(row_a)
    cfg = TenantConfig.objects.first()
    cfg.logo = photo_a
    cfg.save(update_fields=["logo"])
    tenant_with_pages.wizard_state = {"answers": {"niche": "yoga"}}

    action = engine.SetLogoAction(kind="set_logo", description="a calm mark")
    with mock.patch.object(copilot_logos, "preview_url", return_value="https://cdn.example/x.png"):
        card = engine._card(tenant_with_pages, action)
    stashed_id = engine.tokens.take_action(card["token"], tenant_with_pages.schema_name)["curated_logo_id"]
    assert stashed_id == row_b.pk


def test_set_logo_card_current_logo_only_option_drops_with_no_logos_error(tenant_with_pages):
    """Same setup but the catalog has ONLY the tenant's current logo — the
    exclusion must leave nothing to pick, raising LogoOpError (dropped card,
    fallback answer), not silently re-offering the same logo."""
    from django_tenants.utils import schema_context

    from apps.core.copilot import logos as copilot_logos
    from apps.core.curated_logos.materialize import materialize_curated_logo
    from apps.core.models import CuratedLogo
    from apps.tenant_config.models import TenantConfig

    with schema_context("public"):
        row_a = CuratedLogo.objects.create(
            title="Only", tags="yoga", image_key="platform/curated-logos/only.png", enabled=True
        )
    photo_a = materialize_curated_logo(row_a)
    cfg = TenantConfig.objects.first()
    cfg.logo = photo_a
    cfg.save(update_fields=["logo"])
    tenant_with_pages.wizard_state = {"answers": {"niche": "yoga"}}

    action = engine.SetLogoAction(kind="set_logo", description="anything")
    with pytest.raises(copilot_logos.LogoOpError):
        engine._card(tenant_with_pages, action)


def test_user_turn_includes_courses_digest():
    from decimal import Decimal

    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="answer", text="hi"), Decimal("0.01"), "m"

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        engine.run_turn(TENANT, [], [], "hello")
    assert "Courses: (none yet)" in captured["user"]


def test_courses_digest_flags_missing_covers(tenant_with_pages):
    from apps.accounts.models import User
    from apps.courses.models import Course

    instructor = User.objects.create_user(
        email="cover-digest@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    Course.objects.create(title="Yoga Basics", instructor=instructor)
    digest = engine._courses_digest(tenant_with_pages)
    assert "Yoga Basics" in digest and "NO COVER" in digest and "draft" in digest


def test_course_for_cover_resolves_title_and_missing_course(tenant_with_pages):
    from apps.accounts.models import User
    from apps.core.copilot import photos as copilot_photos
    from apps.courses.models import Course

    instructor = User.objects.create_user(
        email="cover-lookup@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    course = Course.objects.create(title="Yoga Basics", instructor=instructor)
    title, exclude_key = engine._course_for_cover(tenant_with_pages, course.pk)
    assert title == "Yoga Basics" and exclude_key is None
    with pytest.raises(copilot_photos.PhotoOpError):
        engine._course_for_cover(tenant_with_pages, 999999)


def test_events_digest_lists_upcoming_live_and_onsite(tenant_with_pages):
    from datetime import timedelta

    from apps.accounts.models import User
    from apps.live.models import LiveClass, OnsiteEvent

    instructor = User.objects.create_user(
        email="events-digest@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    live = LiveClass.objects.create(
        title="Morning Flow",
        instructor=instructor,
        price=0,
        pricing_type="free",
        scheduled_at=timezone.now() + timedelta(days=3),
    )
    onsite = OnsiteEvent.objects.create(
        title="Retreat",
        instructor=instructor,
        price=50,
        pricing_type="paid",
        location="Berlin",
        scheduled_at=timezone.now() + timedelta(days=10),
    )
    digest = engine._events_digest(tenant_with_pages)
    assert f"{live.id} | live | Morning Flow" in digest
    assert f"{onsite.id} | onsite | Retreat" in digest


def test_events_digest_empty(tenant_with_pages):
    assert "(none scheduled)" in engine._events_digest(tenant_with_pages)


def test_posts_digest_lists_status(tenant_with_pages):
    from apps.accounts.models import User
    from apps.blog.models import BlogPost

    author = User.objects.create_user(
        email="posts-digest@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    post = BlogPost.objects.create(title="Why rest matters", status="draft", created_by=author, slug="why-rest")
    digest = engine._posts_digest(tenant_with_pages)
    assert f"{post.id} | Why rest matters | draft" in digest


def test_posts_digest_empty(tenant_with_pages):
    assert "(none yet)" in engine._posts_digest(tenant_with_pages)


def test_user_turn_includes_events_and_posts_digests():
    from decimal import Decimal

    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="answer", text="hi"), Decimal("0.01"), "m"

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 0 (0 new this week); "),
        mock.patch.object(engine, "_setup_digest", return_value="Setup: all done"),
    ):
        engine.run_turn(TENANT, [], [], "hello")
    assert "Upcoming events: (none scheduled)" in captured["user"]


def test_edit_course_card_stashes_params_and_carries_title():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_course", "course_id": 3, "title": "New title", "price": 49}],
    )
    with mock.patch.object(engine, "_course_for_cover", return_value=("Yoga Basics", None)) as course_lookup:
        payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "edit_course"
    assert "Yoga Basics" in card["title"]
    course_lookup.assert_called_once_with(TENANT, 3)
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {
        "kind": "edit_course",
        "course_id": 3,
        "params": {"title": "New title", "price": 49},
    }


def test_edit_course_unknown_course_dropped_with_reason():
    from apps.core.copilot import photos as copilot_photos

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_course", "course_id": 999, "title": "X"}],
    )
    with mock.patch.object(
        engine, "_course_for_cover", side_effect=copilot_photos.PhotoOpError("no course with id 999")
    ):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"
    assert "no course with id 999" in payload["text"]


def test_edit_course_no_fields_dropped_with_reason():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_course", "course_id": 3}],
    )
    with mock.patch.object(engine, "_course_for_cover", return_value=("Yoga Basics", None)):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"
    assert "nothing to change" in payload["text"]


def test_system_prompt_lists_edit_course():
    assert "edit_course" in engine.SYSTEM_PROMPT


def test_edit_event_card_resolves_title_and_stashes_params():
    from apps.core.copilot import tokens as copilot_tokens

    new_when = timezone.now() + timedelta(days=10)
    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "edit_event",
                "event_id": 3,
                "event_kind": "live",
                "scheduled_at": new_when.isoformat(),
            }
        ],
    )
    with mock.patch.object(engine, "_event_title", return_value="Sunrise Flow") as event_lookup:
        payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "edit_event"
    assert "Sunrise Flow" in card["title"]
    assert f"{new_when:%b %d, %Y %H:%M}" in card["detail"]
    event_lookup.assert_called_once_with(TENANT, "live", 3)
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["kind"] == "edit_event"
    assert stashed["event_id"] == 3
    assert stashed["event_kind"] == "live"
    assert stashed["params"]["scheduled_at"] == new_when.isoformat()


def test_edit_event_card_unknown_id_dropped_with_reason():
    from apps.core.copilot import content as copilot_content

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_event", "event_id": 999999, "event_kind": "live", "title": "X"}],
    )
    with mock.patch.object(
        engine, "_event_title", side_effect=copilot_content.ContentOpError("no event with id 999999")
    ):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"
    assert "no event with id 999999" in payload["text"]


def test_edit_event_card_rejects_past_date():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "edit_event",
                "event_id": 3,
                "event_kind": "live",
                "scheduled_at": "2020-01-01T09:00:00Z",
            }
        ],
    )
    with mock.patch.object(engine, "_event_title", return_value="Sunrise Flow"):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"  # past-date proposal dropped, fallback answer


def test_system_prompt_lists_edit_event():
    assert "edit_event" in engine.SYSTEM_PROMPT


def test_edit_blog_post_card_resolves_title_and_stashes_params():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_blog_post", "post_id": 7, "title": "New title", "summary": "Shorter."}],
    )
    with mock.patch.object(engine, "_post_title", return_value="5 stretches") as post_lookup:
        payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "edit_blog_post"
    assert "5 stretches" in card["title"]
    post_lookup.assert_called_once_with(TENANT, 7)
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {
        "kind": "edit_blog_post",
        "post_id": 7,
        "params": {"title": "New title", "summary": "Shorter."},
    }


def test_edit_blog_post_unknown_post_dropped_with_reason():
    from apps.core.copilot import content as copilot_content

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_blog_post", "post_id": 4242, "title": "X"}],
    )
    with mock.patch.object(
        engine, "_post_title", side_effect=copilot_content.ContentOpError("no blog post with id 4242")
    ):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"
    assert "no blog post with id 4242" in payload["text"]


def test_edit_blog_post_no_fields_dropped_with_reason():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_blog_post", "post_id": 7}],
    )
    with mock.patch.object(engine, "_post_title", return_value="5 stretches"):
        payload, _ = _run(parsed)
    assert payload["kind"] == "answer"
    assert "nothing to change" in payload["text"]


def test_system_prompt_lists_edit_blog_post():
    assert "edit_blog_post" in engine.SYSTEM_PROMPT


def test_publish_course_card_resolves_title_and_stashes_id(tenant_with_pages):
    from apps.accounts.models import User
    from apps.core.copilot import tokens as copilot_tokens
    from apps.courses.models import Course

    instructor = User.objects.create_user(
        email="publish-course@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    course = Course.objects.create(
        title="Yoga Basics", instructor=instructor, price=0, pricing_type="free", is_published=False
    )
    action = engine.PublishCourseAction(kind="publish_course", course_id=course.pk)
    card = engine._card(tenant_with_pages, action)
    assert card["kind"] == "publish_course"
    assert "Yoga Basics" in card["title"]
    assert card["detail"] == "Goes live for students the moment you confirm."
    stashed = copilot_tokens.take_action(card["token"], tenant_with_pages.schema_name)
    assert stashed == {"kind": "publish_course", "course_id": course.pk}


def test_publish_course_already_published_dropped_with_reason(tenant_with_pages):
    from apps.accounts.models import User
    from apps.core.copilot import content as copilot_content
    from apps.courses.models import Course

    instructor = User.objects.create_user(
        email="publish-course-2@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    course = Course.objects.create(
        title="Yoga Basics", instructor=instructor, price=0, pricing_type="free", is_published=True
    )
    action = engine.PublishCourseAction(kind="publish_course", course_id=course.pk)
    with pytest.raises(copilot_content.ContentOpError, match="already published"):
        engine._card(tenant_with_pages, action)


def test_publish_blog_post_card_resolves_title_and_stashes_id(tenant_with_pages):
    from apps.accounts.models import User
    from apps.blog.models import BlogPost
    from apps.core.copilot import tokens as copilot_tokens

    author = User.objects.create_user(
        email="publish-post@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    post = BlogPost.objects.create(title="5 stretches", status="draft", created_by=author, slug="5-stretches")
    action = engine.PublishBlogPostAction(kind="publish_blog_post", post_id=post.pk)
    card = engine._card(tenant_with_pages, action)
    assert card["kind"] == "publish_blog_post"
    assert "5 stretches" in card["title"]
    assert card["detail"] == "Goes live for students the moment you confirm."
    stashed = copilot_tokens.take_action(card["token"], tenant_with_pages.schema_name)
    assert stashed == {"kind": "publish_blog_post", "post_id": post.pk}


def test_publish_blog_post_already_published_dropped_with_reason(tenant_with_pages):
    from apps.accounts.models import User
    from apps.blog.models import BlogPost
    from apps.core.copilot import content as copilot_content

    author = User.objects.create_user(
        email="publish-post-2@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    post = BlogPost.objects.create(
        title="5 stretches",
        status="published",
        created_by=author,
        slug="5-stretches-2",
        published_at=timezone.now(),
    )
    action = engine.PublishBlogPostAction(kind="publish_blog_post", post_id=post.pk)
    with pytest.raises(copilot_content.ContentOpError, match="already published"):
        engine._card(tenant_with_pages, action)


def test_system_prompt_lists_publish_course_and_blog_post():
    assert "publish_course" in engine.SYSTEM_PROMPT
    assert "publish_blog_post" in engine.SYSTEM_PROMPT


def test_edit_seo_card_shows_old_new_and_stashes_text(tenant_with_pages):
    from apps.core.copilot import tokens as copilot_tokens
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first()
    cfg.meta_description = "Old description"
    cfg.save(update_fields=["meta_description"])
    action = engine.EditSeoAction(kind="edit_seo", meta_description="New search description for Google")
    card = engine._card(tenant_with_pages, action)
    assert card["kind"] == "edit_seo"
    assert card["title"] == "Update the site's search description"
    assert card["detail"] == "This is the text Google shows under your site name."
    assert len(card["changes"]) == 1
    change = card["changes"][0]
    assert change["page"] == "site"
    assert change["field"] == "meta_description"
    assert change["old"] == "Old description"
    assert change["new"] == "New search description for Google"
    assert card["token"]
    stashed = copilot_tokens.take_action(card["token"], tenant_with_pages.schema_name)
    assert stashed == {"kind": "edit_seo", "meta_description": "New search description for Google"}


def test_system_prompt_lists_edit_seo():
    assert "edit_seo" in engine.SYSTEM_PROMPT


def test_system_prompt_steers_bulk_and_recurring_bundles():
    assert "propose them as one set of cards in a single turn" in engine.SYSTEM_PROMPT
    assert "max 12 cards" in engine.SYSTEM_PROMPT


def test_stats_digest_counts(tenant_with_pages):
    from apps.accounts.models import User
    from apps.courses.models import Course

    instructor = User.objects.create_user(
        email="stats-digest@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    Course.objects.create(title="C", instructor=instructor, price=0, pricing_type="free", is_published=True)
    User.objects.create_user(email="stats-student@x.com", name="Student", password="x")  # noqa: S106
    digest = engine._stats_digest(tenant_with_pages)
    assert "published courses: 1" in digest
    assert "students:" in digest
    assert "students: 1" in digest


def test_setup_digest_lists_open_items(tenant_with_pages):
    digest = engine._setup_digest(tenant_with_pages)
    assert digest.startswith("Setup still open:") or digest == "Setup: all done"


def test_setup_digest_no_config_reports_site_open(tenant_ctx):
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.all().delete()
    digest = engine._setup_digest(tenant_ctx)
    assert digest == "Setup still open: site"


def test_user_turn_includes_stats_and_setup():
    with (
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
        mock.patch.object(engine, "_courses_digest", return_value="Courses: (none yet)"),
        mock.patch.object(engine, "_events_digest", return_value="Upcoming events: (none scheduled)"),
        mock.patch.object(engine, "_posts_digest", return_value="Blog posts: (none yet)"),
        mock.patch.object(engine, "_stats_digest", return_value="Stats: students: 3 (1 new this week)"),
        mock.patch.object(engine, "_setup_digest", return_value="Setup still open: look, first_course"),
    ):
        turn = engine._user_turn(TENANT, [], [], "hi")
    assert "students:" in turn
    assert "Setup" in turn


def test_system_prompt_steers_stats_and_setup():
    assert "Stats line" in engine.SYSTEM_PROMPT
    assert "Setup line" in engine.SYSTEM_PROMPT
    assert "never invent figures" in engine.SYSTEM_PROMPT


# ── attached photos: user-turn context + photo_id card path ──────────────────


def test_user_turn_lists_attached_photos(tenant_ctx):
    from apps.core.copilot import engine
    from apps.core.models import Tenant

    tenant = Tenant.objects.get(schema_name="shared_test")
    turn = engine._user_turn(tenant, [], [], "use this photo", [{"id": "abc-123", "title": "My studio"}])
    assert "photo_id=abc-123" in turn
    assert "My studio" in turn
    assert "attached these photos" in turn


def test_set_block_image_card_with_attached_photo(tenant_ctx):
    from apps.core.copilot import engine, tokens
    from apps.core.models import Tenant
    from apps.media.models import Photo
    from apps.tenant_config.models import TenantConfig

    tenant = Tenant.objects.get(schema_name="shared_test")
    photo = Photo.objects.create(s3_key="uploads/mine.png", title="Mine")
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create()
    cfg.pages = {"home": {"blocks": [{"id": "blk_1", "type": "hero", "enabled": True}]}}
    cfg.save(update_fields=["pages"])

    action = engine.SetBlockImageAction(kind="set_block_image", page="home", block_id="blk_1", photo_id=str(photo.pk))
    card = engine._card(tenant, action)
    assert card["kind"] == "set_block_image"
    assert "your photo" in card["title"].lower()
    stashed = tokens.take_action(card["token"], "shared_test")
    assert stashed["tenant_photo_id"] == str(photo.pk)
    assert stashed["field"] == "bgImage"
    assert "curated_photo_id" not in stashed


def test_set_block_image_card_with_unknown_attached_photo_drops(tenant_ctx):
    import pytest as _pytest

    from apps.core.copilot import engine, photos
    from apps.core.models import Tenant
    from apps.tenant_config.models import TenantConfig

    tenant = Tenant.objects.get(schema_name="shared_test")
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create()
    cfg.pages = {"home": {"blocks": [{"id": "blk_1", "type": "hero", "enabled": True}]}}
    cfg.save(update_fields=["pages"])

    action = engine.SetBlockImageAction(
        kind="set_block_image",
        page="home",
        block_id="blk_1",
        photo_id="00000000-0000-0000-0000-000000000000",
    )
    with _pytest.raises(photos.PhotoOpError, match="not in your library"):
        engine._card(tenant, action)


def test_create_blog_post_card_with_attached_photo(tenant_ctx):
    from apps.core.copilot import engine, tokens
    from apps.core.models import Tenant
    from apps.media.models import Photo

    tenant = Tenant.objects.get(schema_name="shared_test")
    photo = Photo.objects.create(s3_key="uploads/blogcover.png", title="Blog cover")
    action = engine.CreateBlogPostAction(
        kind="create_blog_post", title="My post", summary="s", body_html="<p>b</p>", photo_id=str(photo.pk)
    )
    card = engine._card(tenant, action)
    assert "cover" in card["detail"]
    assert card["image_url"]
    stashed = tokens.take_action(card["token"], "shared_test")
    assert stashed["params"]["cover_photo"] == str(photo.pk)
