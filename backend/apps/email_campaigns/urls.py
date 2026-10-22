from django.urls import path

from . import images, views

urlpatterns = [
    path("brand/", views.brand_view, name="email-brand"),
    path("catalog/", views.catalog_view, name="email-catalog"),
    path("images/", views.image_view, name="email-images"),
    path("i/<str:token>/", images.email_image, name="email-image"),
    path("render/", views.render_view, name="email-render"),
    path("templates/", views.template_list, name="email-template-list"),
    path("templates/<int:pk>/", views.template_detail, name="email-template-detail"),
    path("templates/<int:pk>/duplicate/", views.template_duplicate, name="email-template-duplicate"),
    path("recipients/count/", views.recipient_count, name="email-recipient-count"),
    path("campaigns/", views.campaign_list, name="email-campaign-list"),
    path("campaigns/<int:pk>/", views.campaign_detail, name="email-campaign-detail"),
    path("campaigns/<int:pk>/send/", views.campaign_send, name="email-campaign-send"),
    path("campaigns/<int:pk>/test/", views.campaign_test, name="email-campaign-test"),
    path("campaigns/<int:pk>/recipients/", views.campaign_recipients, name="email-campaign-recipients"),
    path("campaigns/<int:pk>/save-as-template/", views.campaign_save_as_template, name="email-campaign-template"),
    path("designer/", views.designer_start, name="email-designer"),
    path("designer/<int:pk>/", views.designer_job, name="email-designer-job"),
]
