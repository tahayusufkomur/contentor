from django.urls import path

from .demo_content import demo_content, erase_demo_content
from .views import (
    TenantConfigView,
    admin_stats,
    help_bot_chat,
    help_bot_status,
    logo_brand_pack,
    logo_brand_pack_status,
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
    path("config/logo-brand-pack/", logo_brand_pack, name="logo-brand-pack"),
    path(
        "config/logo-brand-pack/status/",
        logo_brand_pack_status,
        name="logo-brand-pack-status",
    ),
]
