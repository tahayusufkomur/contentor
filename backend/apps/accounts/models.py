from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.core.constants import LOCALE_CHOICES, REGION_CHOICES, REGION_GLOBAL

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    # Email is unique PER REGION, not globally. The same person may legitimately
    # operate businesses in multiple regions; each region gets its own account
    # row, its own preferences, and its own Stripe customer. JWT region claim
    # plus TenantJWTAuthentication isolation already prevents cross-region
    # leakage even with this looser key.
    email = models.EmailField()
    name = models.CharField(max_length=150)
    avatar_url = models.URLField(blank=True, default="")
    role = models.CharField(
        max_length=20,
        choices=[
            ("owner", "Owner"),
            ("coach", "Coach"),
            ("student", "Student"),
        ],
        default="student",
    )
    region = models.CharField(
        max_length=8,
        choices=REGION_CHOICES,
        default=REGION_GLOBAL,
        db_index=True,
        help_text=(
            "The region this user first signed up in. Informational only — "
            "auth-time isolation is enforced by Tenant.region via JWT claims. "
            "Same email may own tenants across multiple regions."
        ),
    )
    preferred_locale = models.CharField(
        max_length=2,
        choices=LOCALE_CHOICES,
        blank=True,
        default="",
        help_text="Empty = fall back to tenant default; otherwise overrides.",
    )
    accessible_regions = ArrayField(
        base_field=models.CharField(max_length=8, choices=REGION_CHOICES),
        default=list,
        blank=True,
        null=True,
        help_text="Superadmin only: regions this user can see in Django admin.",
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    payment_customer_id = models.CharField(max_length=255, blank=True, default="")
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)

    objects = UserManager()
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        app_label = "accounts"
        constraints = [
            models.UniqueConstraint(
                fields=["email", "region"],
                name="accounts_user_email_region_unique",
            ),
        ]

    def __str__(self):
        return f"{self.email} [{self.region}]"
