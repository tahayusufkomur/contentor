from django.urls import path

from . import views

urlpatterns = [
    path("conversations/", views.conversation_list, name="mailbox-conversation-list"),
    path("conversations/<int:pk>/", views.conversation_detail, name="mailbox-conversation-detail"),
    path("conversations/<int:pk>/reply/", views.reply, name="mailbox-reply"),
    path("compose/", views.compose, name="mailbox-compose"),
]
