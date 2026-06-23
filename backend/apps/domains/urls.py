from django.urls import path

from . import views

urlpatterns = [
    path("search/", views.search, name="domains-search"),
    path("checkout/", views.checkout, name="domains-checkout"),
    path("", views.current, name="domains-current"),
    path("<int:pk>/retry/", views.retry, name="domains-retry"),
    path("<int:pk>/", views.destroy, name="domains-destroy"),
]
