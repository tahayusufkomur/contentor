from django.urls import path

from .assistant_views import (
    assistant_chat,
    assistant_human_message,
    assistant_human_request,
    assistant_status,
    assistant_thread,
)

urlpatterns = [
    path("status/", assistant_status, name="assistant-status"),
    path("chat/", assistant_chat, name="assistant-chat"),
    path("thread/", assistant_thread, name="assistant-thread"),
    path("human-message/", assistant_human_message, name="assistant-human-message"),
    path("human-request/", assistant_human_request, name="assistant-human-request"),
]
