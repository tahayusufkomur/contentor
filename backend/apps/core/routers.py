from django.conf import settings
from django_tenants.routers import TenantSyncRouter
from django_tenants.utils import get_public_schema_name


class TenantRouter(TenantSyncRouter):
    """
    Extends django-tenants router to strictly prevent tenant-only apps
    from being migrated into the public schema.
    """

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        from django.db import connections

        connection = connections[db]
        if connection.schema_name == get_public_schema_name():
            if not self.app_in_list(app_label, settings.SHARED_APPS):
                return False
        return super().allow_migrate(db, app_label, model_name=model_name, **hints)
