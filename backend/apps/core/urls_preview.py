from django.urls import path

from apps.core.views_preview import preview_unlock

urlpatterns = [
    path("unlock/", preview_unlock, name="preview-unlock"),
]
