from django.urls import path

from .views import access

urlpatterns = [
    path("<str:kind>/<int:pk>/", access.access_detail, name="access-detail"),
]
