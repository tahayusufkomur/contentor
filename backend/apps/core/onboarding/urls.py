from django.urls import path

from .views import (
    creator_signup,
    creator_signup_verify,
    provisioning_status,
    seed_from_template,
    skip_template,
)

urlpatterns = [
    path("signup/", creator_signup, name="creator-signup"),
    path("signup/verify/", creator_signup_verify, name="creator-signup-verify"),
    path("seed-from-template/", seed_from_template, name="seed-from-template"),
    path("skip-template/", skip_template, name="skip-template"),
    path("status/", provisioning_status, name="provisioning-status"),
]
