from django.urls import path

from . import views

urlpatterns = [
    path("setup/", views.setup_email, name="email-setup"),
    path("session/", views.create_session, name="email-session"),
    path("templates/", views.template_list, name="email-template-list"),
    path("templates/<str:template_id>/", views.template_detail, name="email-template-detail"),
    path("gallery/", views.gallery_list, name="email-gallery-list"),
    path("send/", views.send_campaign, name="email-send"),
    path("campaigns/", views.campaign_list, name="email-campaign-list"),
    path("campaigns/<int:pk>/", views.campaign_detail, name="email-campaign-detail"),
]
