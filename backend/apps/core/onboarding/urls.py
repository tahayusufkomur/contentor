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
from .wizard_logo import (
    wizard_logo_converse,
    wizard_logo_converse_finish,
    wizard_logo_refine,
    wizard_logo_status,
)

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
    path("wizard/logo-status/", wizard_logo_status, name="wizard-logo-status"),
    path("wizard/logo-converse/", wizard_logo_converse, name="wizard-logo-converse"),
    path("wizard/logo-converse/finish/", wizard_logo_converse_finish, name="wizard-logo-converse-finish"),
    path("wizard/logo-refine/", wizard_logo_refine, name="wizard-logo-refine"),
]
