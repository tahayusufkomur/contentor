from django.urls import path

from .assistant_views import (
    assistant_config,
    assistant_conversation_message,
    assistant_conversation_release,
    assistant_conversation_takeover,
    assistant_conversation_thread,
    assistant_conversations,
    assistant_knowledge,
    assistant_knowledge_detail,
    assistant_link_detail,
    assistant_links,
    assistant_preview_chat,
    assistant_transcripts,
)
from .demo_content import demo_content, erase_demo_content
from .views import (
    TenantConfigView,
    admin_stats,
    help_bot_chat,
    help_bot_human_message,
    help_bot_human_request,
    help_bot_status,
    help_bot_thread,
    logo_brand_pack,
    logo_brand_pack_status,
    logo_refine,
    setup_status,
)

urlpatterns = [
    path("config/", TenantConfigView.as_view(), name="tenant-config"),
    path("stats/", admin_stats, name="admin-stats"),
    path("setup-status/", setup_status, name="setup-status"),
    path("demo-content/", demo_content, name="demo-content"),
    path("demo-content/erase/", erase_demo_content, name="demo-content-erase"),
    path("help-bot/chat/", help_bot_chat, name="help-bot-chat"),
    path("help-bot/status/", help_bot_status, name="help-bot-status"),
    path("help-bot/thread/", help_bot_thread, name="help-bot-thread"),
    path("help-bot/human-message/", help_bot_human_message, name="help-bot-human-message"),
    path("help-bot/human-request/", help_bot_human_request, name="help-bot-human-request"),
    path("config/logo-brand-pack/", logo_brand_pack, name="logo-brand-pack"),
    path(
        "config/logo-brand-pack/status/",
        logo_brand_pack_status,
        name="logo-brand-pack-status",
    ),
    path("config/logo-refine/", logo_refine, name="logo-refine"),
    path("assistant/config/", assistant_config, name="assistant-config"),
    path("assistant/knowledge/", assistant_knowledge, name="assistant-knowledge"),
    path("assistant/knowledge/<int:pk>/", assistant_knowledge_detail, name="assistant-knowledge-detail"),
    path("assistant/links/", assistant_links, name="assistant-links"),
    path("assistant/links/<int:pk>/", assistant_link_detail, name="assistant-link-detail"),
    path("assistant/transcripts/", assistant_transcripts, name="assistant-transcripts"),
    path("assistant/preview-chat/", assistant_preview_chat, name="assistant-preview-chat"),
    path("assistant/conversations/", assistant_conversations, name="assistant-conversations"),
    path(
        "assistant/conversations/<int:pk>/thread/",
        assistant_conversation_thread,
        name="assistant-conversation-thread",
    ),
    path(
        "assistant/conversations/<int:pk>/takeover/",
        assistant_conversation_takeover,
        name="assistant-conversation-takeover",
    ),
    path(
        "assistant/conversations/<int:pk>/message/",
        assistant_conversation_message,
        name="assistant-conversation-message",
    ),
    path(
        "assistant/conversations/<int:pk>/release/",
        assistant_conversation_release,
        name="assistant-conversation-release",
    ),
]
