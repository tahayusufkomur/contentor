from django.urls import path

from .views import demo_enter

urlpatterns = [
    path("enter/", demo_enter, name="demo-enter"),
]
