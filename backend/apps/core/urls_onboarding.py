from django.urls import path
from .views import creator_signup, creator_signup_verify, provisioning_status

urlpatterns = [
    path("signup/", creator_signup, name="creator-signup"),
    path("signup/verify/", creator_signup_verify, name="creator-signup-verify"),
    path("status/", provisioning_status, name="provisioning-status"),
]
