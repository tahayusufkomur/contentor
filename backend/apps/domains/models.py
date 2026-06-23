from __future__ import annotations

from django.db import models

PROVISIONING_STATUSES = [
    ("pending", "Pending"),
    ("registering", "Registering"),
    ("dns_zone", "Creating DNS zone"),
    ("dns_records", "Creating DNS records"),
    ("email_auth", "Configuring email"),
    ("ssl", "Issuing SSL"),
    ("live", "Live"),
    ("failed", "Failed"),
    ("lapsed", "Lapsed"),
]


class CustomDomain(models.Model):
    tenant = models.ForeignKey("core.Tenant", on_delete=models.CASCADE, related_name="custom_domains")
    domain = models.CharField(max_length=255, unique=True)
    registrar = models.CharField(max_length=20, default="route53")
    registrar_status = models.CharField(max_length=40, blank=True, default="")
    cloudflare_zone_id = models.CharField(max_length=64, blank=True, default="")
    resend_domain_id = models.CharField(max_length=64, blank=True, default="")
    forward_to_email = models.EmailField(blank=True, default="")
    contact = models.JSONField(default=dict, blank=True)
    cost_minor = models.IntegerField()
    price_minor = models.IntegerField()
    currency = models.CharField(max_length=3)
    fx_rate = models.FloatField(default=1.0)
    provisioning_status = models.CharField(max_length=20, choices=PROVISIONING_STATUSES, default="pending")
    failed_step = models.CharField(max_length=40, blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    auto_renew = models.BooleanField(default=True)
    is_primary = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "domains"

    def __str__(self) -> str:
        return self.domain


class DomainSubscription(models.Model):
    tenant = models.ForeignKey("core.Tenant", on_delete=models.CASCADE, related_name="domain_subscriptions")
    custom_domain = models.OneToOneField(CustomDomain, on_delete=models.CASCADE, related_name="subscription")
    provider = models.CharField(max_length=20, default="stripe")
    provider_subscription_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    provider_customer_id = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, default="incomplete")
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "domains"

    def __str__(self) -> str:
        return f"{self.custom_domain.domain} ({self.status})"
