from django.urls import path
from . import views

urlpatterns = [
    path("magic-link/", views.magic_link_request, name="magic-link-request"),
    path("magic-link/verify/", views.magic_link_verify, name="magic-link-verify"),
    path("google/", views.google_login, name="google-login"),
    path("google/callback/", views.google_callback, name="google-callback"),
    path("logout/", views.logout, name="logout"),
    path("users/me/", views.me, name="user-me"),
    path("users/me/update/", views.update_me, name="user-update"),
]
