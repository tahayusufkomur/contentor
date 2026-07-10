from django.urls import path

from .assistant_views import assistant_chat, assistant_status

urlpatterns = [
    path("status/", assistant_status, name="assistant-status"),
    path("chat/", assistant_chat, name="assistant-chat"),
]
