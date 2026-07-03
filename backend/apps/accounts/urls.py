from django.urls import path

from . import views

urlpatterns = [
    path("magic-link/", views.magic_link_request, name="magic-link-request"),
    path("magic-link/verify/", views.magic_link_verify, name="magic-link-verify"),
    path("magic-link/verify-code/", views.magic_link_verify_code, name="magic-link-verify-code"),
    path("google/", views.google_login, name="google-login"),
    path("google/callback/", views.google_callback, name="google-callback"),
    path("logout/", views.logout, name="logout"),
    path("impersonate/verify/", views.impersonate_verify, name="impersonate-verify"),
    path("impersonate/stop/", views.impersonate_stop, name="impersonate-stop"),
    path("users/me/", views.me, name="user-me"),
    path("users/me/update/", views.update_me, name="user-update"),
    path("users/me/locale/", views.update_locale, name="user-locale"),
    path("students/", views.student_list, name="student-list"),
    path("students/<int:pk>/", views.student_delete, name="student-delete"),
]
