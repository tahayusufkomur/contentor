from django.urls import path
from .views import creator_signup, provisioning_status

urlpatterns = [
    path("signup/", creator_signup, name="creator-signup"),
    path("status/", provisioning_status, name="provisioning-status"),
]
