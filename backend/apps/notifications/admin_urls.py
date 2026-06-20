from django.urls import path

from . import views

urlpatterns = [path("notifications/broadcast/", views.broadcast, name="push-broadcast")]
