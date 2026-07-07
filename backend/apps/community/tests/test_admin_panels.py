import pytest

pytestmark = pytest.mark.django_db(transaction=True)


def test_community_models_registered_on_studio_site():
    import apps.community.admin_panels  # noqa: F401 — ensure module import registers

    from apps.adminkit.sites import studio_site

    keys = set(studio_site._registry.keys())
    assert {"community-posts", "community-comments", "community-reports", "community-members"} <= keys


def test_registered_admins_are_owner_scoped():
    import apps.community.admin_panels  # noqa: F401

    from apps.adminkit.sites import studio_site
    from apps.core.permissions import IsCoachOrOwner

    for key in ("community-posts", "community-comments", "community-reports", "community-members"):
        admin = studio_site._registry[key]
        assert IsCoachOrOwner in tuple(admin.permission_classes)
