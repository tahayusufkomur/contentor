from django.urls import path

from . import views_me

urlpatterns = [
    path("tenants/", views_me.my_tenants, name="me-tenants"),
]
