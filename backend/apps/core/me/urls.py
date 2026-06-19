from django.urls import path

from . import views

urlpatterns = [
    path("tenants/", views.my_tenants, name="me-tenants"),
    path("tenants/<slug:slug>/", views.update_my_tenant, name="me-tenant-update"),
]
