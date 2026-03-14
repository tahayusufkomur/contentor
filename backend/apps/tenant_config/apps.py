from django.apps import AppConfig


class TenantConfigConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tenant_config"
    label = "tenant_config"
