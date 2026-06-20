from django.urls import path

from . import views

urlpatterns = [
    path("vapid-key/", views.vapid_key, name="push-vapid-key"),
    path("subscribe/", views.subscribe, name="push-subscribe"),
    path("unsubscribe/", views.unsubscribe, name="push-unsubscribe"),
]
