from django.urls import path

from . import views_multipart, views_upload

urlpatterns = [
    path("presign/", views_upload.presign, name="upload-presign"),
    path("complete/", views_upload.complete, name="upload-complete"),
    path("multipart/initiate/", views_multipart.initiate, name="upload-multipart-initiate"),
    path("multipart/complete/", views_multipart.complete, name="upload-multipart-complete"),
    path("multipart/abort/", views_multipart.abort, name="upload-multipart-abort"),
]
