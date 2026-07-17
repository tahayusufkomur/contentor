import pytest

from apps.demo_seed.registry import list_niches, load_niche

NICHES = ["fitness", "yoga", "pilates", "belly_dance", "face_yoga", "makeup", "pole_dance"]


@pytest.mark.parametrize("niche", NICHES)
def test_vertical_data_has_the_seed_contract_attrs(niche):
    data = load_niche(niche)
    for attr in ("TENANT", "CONFIG", "COURSES"):
        assert hasattr(data, attr)


def test_list_niches_finds_all_verticals():
    assert set(NICHES) <= set(list_niches())
