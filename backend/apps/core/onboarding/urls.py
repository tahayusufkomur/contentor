from django.urls import path

from .recovery import wizard_recover
from .views import (
    check_brand_name,
    creator_signup,
    creator_signup_authenticated,
    creator_signup_verify,
    onboarding_handoff,
    provisioning_status,
    seed_from_template,
    skip_template,
)

urlpatterns = [
    path("signup/", creator_signup, name="creator-signup"),
    path("check-brand-name/", check_brand_name, name="check-brand-name"),
    path("signup/authenticated/", creator_signup_authenticated, name="creator-signup-authenticated"),
    path("signup/verify/", creator_signup_verify, name="creator-signup-verify"),
    path("seed-from-template/", seed_from_template, name="seed-from-template"),
    path("skip-template/", skip_template, name="skip-template"),
    path("handoff/", onboarding_handoff, name="onboarding-handoff"),
    path("status/", provisioning_status, name="provisioning-status"),
    path("wizard/recover/", wizard_recover, name="wizard-recover"),
]
