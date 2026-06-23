from django.apps import apps as django_apps


def test_domains_app_is_installed():
    assert django_apps.is_installed("apps.domains")


def test_domains_settings_present(settings):
    assert hasattr(settings, "DOMAINS_BYPASS_ENABLED")
    assert settings.DOMAINS_MARKUP_MULTIPLIER == 1.20
