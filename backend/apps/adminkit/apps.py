from django.apps import AppConfig
from django.utils.module_loading import autodiscover_modules


class AdminkitConfig(AppConfig):
    name = "apps.adminkit"
    label = "adminkit"
    verbose_name = "Admin Kit"

    def ready(self):
        # Each app declares its admin registrations in an `admin_panels.py`
        # module (mirrors Django's `admin.py` autodiscovery without clashing
        # with it).
        autodiscover_modules("admin_panels")
