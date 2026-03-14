from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
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

    def __str__(self):
        return self.email
