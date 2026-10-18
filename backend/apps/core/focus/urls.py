from django.urls import path

from apps.core.focus import views

urlpatterns = [
    path("", views.focus_root, name="focus-root"),
    path("form-timing/", views.focus_form_timing, name="focus-form-timing"),
    path("<int:creation_id>/", views.focus_detail, name="focus-detail"),
    path("<int:creation_id>/answer/", views.focus_answer, name="focus-answer"),
    path("<int:creation_id>/finish/", views.focus_finish, name="focus-finish"),
    path("<int:creation_id>/descriptions/", views.focus_descriptions, name="focus-descriptions"),
    path("<int:creation_id>/leave/", views.focus_leave, name="focus-leave"),
]
