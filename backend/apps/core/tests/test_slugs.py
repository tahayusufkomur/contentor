import pytest

from apps.core.slugs import slugify

CASES = {
    "Işık Yoga": "isik-yoga",
    "Łódź Pilates": "lodz-pilates",
    "Straße Fitness": "strasse-fitness",
    "Gülşen Çağrı": "gulsen-cagri",
    "İstanbul Dans": "istanbul-dans",
    "Zażółć gęślą jaźń": "zazolc-gesla-jazn",
    "Yoga with Mara": "yoga-with-mara",
}


@pytest.mark.parametrize(("name", "slug"), CASES.items())
def test_slugify_keeps_the_letters(name, slug):
    assert slugify(name) == slug
