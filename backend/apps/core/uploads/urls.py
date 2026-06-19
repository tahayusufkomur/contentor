from django.urls import path

from . import multipart, views

urlpatterns = [
    path("presign/", views.presign, name="upload-presign"),
    path("complete/", views.complete, name="upload-complete"),
    path("multipart/initiate/", multipart.initiate, name="upload-multipart-initiate"),
    path("multipart/complete/", multipart.complete, name="upload-multipart-complete"),
    path("multipart/abort/", multipart.abort, name="upload-multipart-abort"),
]
