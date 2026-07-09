from django.urls import path

from .views import help_bot_public_chat, help_bot_public_status

urlpatterns = [
    path("chat/", help_bot_public_chat, name="help-bot-public-chat"),
    path("status/", help_bot_public_status, name="help-bot-public-status"),
]
