from django.urls import path

from apps.core.preview.views import preview_unlock

urlpatterns = [
    path("unlock/", preview_unlock, name="preview-unlock"),
]
