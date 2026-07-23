"""Smoke test: the extracted content-seeding helpers are importable.

The heavy per-function behaviour is exercised end-to-end by Task C2's
``seed_dev_tenants`` command (and its tests); this guards the module's public
surface so later tasks that import these names fail loudly here if one is renamed
or removed.
"""


def test_helpers_import():
    from apps.demo_seed import seeding_helpers

    expected = (
        "seed_photos",
        "seed_config",
        "seed_courses",
        "seed_downloads",
        "seed_subscription_plans",
        "seed_bundles",
        "seed_live_bundle",
        "seed_students",
        "seed_purchases_and_progress",
    )
    for fn in expected:
        assert hasattr(seeding_helpers, fn), f"missing helper: {fn}"
        assert callable(getattr(seeding_helpers, fn))


def test_other_member_never_returns_exclude_for_two_members():
    from apps.demo_seed.seeding_helpers import _other_member

    members = ["A", "B"]
    for exclude in members:
        for offset in range(11):
            result = _other_member(members, exclude, offset=offset)
            assert result != exclude, f"offset={offset} returned exclude={exclude!r}"


def test_other_member_never_returns_exclude_for_three_members():
    from apps.demo_seed.seeding_helpers import _other_member

    members = ["A", "B", "C"]
    for exclude in members:
        for offset in range(11):
            result = _other_member(members, exclude, offset=offset)
            assert result != exclude, f"offset={offset} returned exclude={exclude!r}"


def test_other_member_falls_back_to_exclude_for_single_member():
    from apps.demo_seed.seeding_helpers import _other_member

    members = ["A"]
    for offset in range(5):
        assert _other_member(members, "A", offset=offset) == "A"
