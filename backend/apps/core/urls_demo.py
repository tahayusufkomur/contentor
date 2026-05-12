from django.urls import path

from .views_demo import demo_enter

urlpatterns = [
    path("enter/", demo_enter, name="demo-enter"),
]
