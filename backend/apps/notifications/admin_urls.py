from django.urls import path

from . import admin_views, views

urlpatterns = [
    # Legacy broadcast route — kept until Task 8 removes it with its view + test
    path("notifications/broadcast/", views.broadcast, name="push-broadcast"),
    # Announcement CRUD
    path("notifications/announcements/preview/", admin_views.announcement_preview, name="announcement-preview"),
    path("notifications/announcements/", admin_views.announcement_collection, name="announcement-collection"),
    path("notifications/announcements/<int:pk>/", admin_views.announcement_detail, name="announcement-detail"),
]
