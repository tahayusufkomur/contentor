from django.urls import path

from .views import (
    help_bot_public_chat,
    help_bot_public_human_message,
    help_bot_public_human_request,
    help_bot_public_status,
    help_bot_public_thread,
)

urlpatterns = [
    path("chat/", help_bot_public_chat, name="help-bot-public-chat"),
    path("status/", help_bot_public_status, name="help-bot-public-status"),
    path("thread/", help_bot_public_thread, name="help-public-thread"),
    path("human-message/", help_bot_public_human_message, name="help-public-human-message"),
    path("human-request/", help_bot_public_human_request, name="help-public-human-request"),
]
