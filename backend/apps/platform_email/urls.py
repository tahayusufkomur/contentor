from django.urls import path

from . import views

urlpatterns = [
    path("setup/", views.setup_email, name="platform-email-setup"),
    path("session/", views.create_session, name="platform-email-session"),
    path("templates/", views.template_list, name="platform-email-template-list"),
    path("templates/copy/", views.copy_template, name="platform-email-template-copy"),
    path("templates/preview/", views.template_preview_batch, name="platform-email-template-preview"),
    path("templates/<str:template_id>/", views.template_detail, name="platform-email-template-detail"),
    path("gallery/", views.gallery_list, name="platform-email-gallery-list"),
    path("recipient-options/", views.recipient_options, name="platform-email-recipient-options"),
    path("send/", views.send_campaign, name="platform-email-send"),
    path("campaigns/", views.campaign_list, name="platform-email-campaign-list"),
    path("campaigns/<int:pk>/", views.campaign_detail, name="platform-email-campaign-detail"),
    path("campaigns/<int:pk>/recipients/", views.campaign_recipients, name="platform-email-campaign-recipients"),
]
