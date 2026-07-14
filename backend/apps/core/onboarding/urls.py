from django.urls import path

from .views import (
    creator_signup,
    creator_signup_authenticated,
    creator_signup_verify,
    onboarding_handoff,
    provisioning_status,
    seed_from_template,
    skip_template,
)
from .wizard import wizard_catalog_view, wizard_finalize, wizard_state

urlpatterns = [
    path("signup/", creator_signup, name="creator-signup"),
    path("signup/authenticated/", creator_signup_authenticated, name="creator-signup-authenticated"),
    path("signup/verify/", creator_signup_verify, name="creator-signup-verify"),
    path("seed-from-template/", seed_from_template, name="seed-from-template"),
    path("skip-template/", skip_template, name="skip-template"),
    path("handoff/", onboarding_handoff, name="onboarding-handoff"),
    path("status/", provisioning_status, name="provisioning-status"),
    path("wizard/catalog/", wizard_catalog_view, name="wizard-catalog"),
    path("wizard/state/", wizard_state, name="wizard-state"),
    path("wizard/finalize/", wizard_finalize, name="wizard-finalize"),
]
