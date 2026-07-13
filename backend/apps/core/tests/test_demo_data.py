import importlib

import pytest

NICHES = ["fitness", "yoga", "pilates", "belly_dance", "face_yoga", "makeup", "pole_dance"]


@pytest.mark.parametrize("niche", NICHES)
def test_vertical_config_is_built_on_the_shared_base(niche):
    from apps.core.management.commands.demo_data import _base

    mod = importlib.import_module(f"apps.core.management.commands.demo_data.{niche}")
    # Every key in the shared base must exist in the merged CONFIG …
    for key in _base.CONFIG_BASE:
        assert key in mod.CONFIG, f"{niche}.CONFIG lost base key {key!r}"
    # … and the seed contract attrs must all still be present.
    for attr in ("TENANT", "CONFIG", "COURSES"):
        assert hasattr(mod, attr)


def test_deep_merge_semantics():
    from apps.core.management.commands.demo_data._base import deep_merge

    base = {"a": 1, "nested": {"x": 1, "y": 2}, "lst": [1, 2]}
    out = deep_merge(base, {"nested": {"y": 3}, "lst": [9]})
    assert out == {"a": 1, "nested": {"x": 1, "y": 3}, "lst": [9]}
    assert base == {"a": 1, "nested": {"x": 1, "y": 2}, "lst": [1, 2]}  # no mutation
