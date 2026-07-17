import pytest

from apps.core.demo.seed_template import available_niches

pytestmark = pytest.mark.django_db


def test_general_niche_available():
    assert "general" in available_niches()


def test_general_module_shape():
    from apps.demo_seed.management.commands.demo_data import general

    assert general.CONFIG["enabled_modules"]
    assert len(general.COURSES) == 3
    for course in general.COURSES:
        assert course["lessons"], course["title"]
    assert len(general.DOWNLOADS) == 2
