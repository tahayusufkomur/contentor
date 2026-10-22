from django.urls import path

from . import views

urlpatterns = [
    path("brand/", views.brand_view, name="platform-email-brand"),
    path("render/", views.render_view, name="platform-email-render"),
    path("templates/", views.template_list, name="platform-email-template-list"),
    path("templates/<int:pk>/", views.template_detail, name="platform-email-template-detail"),
    path("recipient-options/", views.recipient_options, name="platform-email-recipient-options"),
    path("campaigns/", views.campaign_list, name="platform-email-campaign-list"),
    path("campaigns/<int:pk>/", views.campaign_detail, name="platform-email-campaign-detail"),
    path("campaigns/<int:pk>/send/", views.campaign_send, name="platform-email-campaign-send"),
    path("campaigns/<int:pk>/test/", views.campaign_test, name="platform-email-campaign-test"),
    path("campaigns/<int:pk>/recipients/", views.campaign_recipients, name="platform-email-campaign-recipients"),
]
