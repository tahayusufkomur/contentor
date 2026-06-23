from django.urls import path

from . import admin_views

urlpatterns = [
    # Announcement CRUD
    path("notifications/announcements/preview/", admin_views.announcement_preview, name="announcement-preview"),
    path("notifications/announcements/", admin_views.announcement_collection, name="announcement-collection"),
    path("notifications/announcements/<int:pk>/", admin_views.announcement_detail, name="announcement-detail"),
    # Templates
    path("notifications/templates/", admin_views.template_collection, name="announcement-templates"),
    path("notifications/templates/<int:pk>/", admin_views.template_detail, name="announcement-template-detail"),
]
