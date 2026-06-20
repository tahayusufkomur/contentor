from django.urls import path

from . import views

urlpatterns = [
    path("", views.course_list_create, name="course-list-create"),
    path("enrolled/", views.enrolled_courses, name="enrolled-courses"),
    path("videos/", views.video_list_create, name="video-list-create"),
    path("videos/<int:pk>/", views.video_detail, name="video-detail"),
    # Categories must precede the <slug> route so "categories" isn't captured
    # as a course slug.
    path("categories/", views.category_list_create, name="category-list-create"),
    path("categories/<int:pk>/", views.category_detail, name="category-detail"),
    path("<slug:slug>/", views.course_detail, name="course-detail"),
    path("<slug:slug>/enroll/", views.enroll, name="course-enroll"),
    path("<slug:slug>/progress/", views.course_progress, name="course-progress"),
    path(
        "<slug:slug>/lessons/<int:lesson_id>/progress/",
        views.update_progress,
        name="lesson-progress",
    ),
    path("<slug:slug>/modules/", views.module_create, name="module-create"),
    path(
        "<slug:slug>/modules/<int:module_id>/",
        views.module_detail,
        name="module-detail",
    ),
    path(
        "<slug:slug>/modules/<int:module_id>/lessons/",
        views.lesson_create,
        name="lesson-create",
    ),
    path(
        "<slug:slug>/lessons/<int:lesson_id>/",
        views.lesson_detail,
        name="lesson-detail",
    ),
]
