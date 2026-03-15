from django.urls import path

from . import views_upload

urlpatterns = [
    path("presign/", views_upload.presign, name="upload-presign"),
    path("complete/", views_upload.complete, name="upload-complete"),
]
