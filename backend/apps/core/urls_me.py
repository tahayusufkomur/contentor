from django.urls import path

from . import views_me

urlpatterns = [
    path("tenants/", views_me.my_tenants, name="me-tenants"),
    path("tenants/<slug:slug>/", views_me.update_my_tenant, name="me-tenant-update"),
]
