import logging
from celery import shared_task
from django_tenants.utils import tenant_context

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def provision_tenant(self, tenant_id, owner_email, owner_name):
    from apps.core.models import Tenant

    tenant = Tenant.objects.get(id=tenant_id)
    try:
        tenant.provisioning_status = "provisioning"
        tenant.save(update_fields=["provisioning_status"])

        tenant.create_schema(check_if_exists=True, verbosity=0)

        # Create owner in main (public) schema if they don't exist yet
        from apps.accounts.models import User

        User.objects.get_or_create(
            email=owner_email,
            defaults={"name": owner_name, "role": "coach"},
        )

        # Create owner + config in tenant schema
        with tenant_context(tenant):
            from apps.tenant_config.models import TenantConfig

            TenantConfig.objects.create(
                brand_name=tenant.name,
                enabled_modules=["courses", "live", "community", "downloads", "billing", "campaigns", "analytics", "pages"],
            )
            User.objects.create_user(email=owner_email, name=owner_name, role="owner", is_staff=True)

        tenant.provisioning_status = "ready"
        tenant.save(update_fields=["provisioning_status"])
        logger.info("Tenant %s provisioned successfully", tenant.slug)

    except Exception as exc:
        tenant.provisioning_status = "failed"
        tenant.save(update_fields=["provisioning_status"])
        logger.exception("Tenant provisioning failed for %s", tenant.slug)
        raise self.retry(exc=exc)
