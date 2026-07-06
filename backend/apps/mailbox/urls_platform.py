from django.urls import path

from . import views

# Superadmin platform inbox — same handlers as the coach mailbox, minus the
# address-picker settings tab and the inbound webhook. Guarded by IsSuperUser
# (via the broadened permission on the shared views).
urlpatterns = [
    path("conversations/", views.platform_conversation_list, name="platform-mailbox-conversation-list"),
    path(
        "conversations/<int:pk>/",
        views.platform_conversation_detail,
        name="platform-mailbox-conversation-detail",
    ),
    path("conversations/<int:pk>/reply/", views.platform_reply, name="platform-mailbox-reply"),
    path("compose/", views.platform_compose, name="platform-mailbox-compose"),
    path("attachments/", views.platform_upload_attachment, name="platform-mailbox-attachment-upload"),
]
