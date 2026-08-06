from django.urls import path

from apps.core.copilot import views

urlpatterns = [
    path("converse/", views.copilot_converse, name="copilot-converse"),
    path("execute/", views.copilot_execute, name="copilot-execute"),
    path("audit/", views.copilot_audit, name="copilot-audit"),
    path("undo/", views.copilot_undo, name="copilot-undo"),
    path("photos/describe/", views.copilot_photo_describe, name="copilot-photo-describe"),
    path("chats/", views.copilot_chats, name="copilot-chats"),
    path("chats/<int:chat_id>/", views.copilot_chat_detail, name="copilot-chat-detail"),
]
