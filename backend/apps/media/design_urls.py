from django.urls import path

from . import design_views

urlpatterns = [
    path("", design_views.design_list_create, name="design-list-create"),
    path("targets/", design_views.design_targets, name="design-targets"),
    path("<uuid:pk>/", design_views.design_detail, name="design-detail"),
    path("<uuid:pk>/keep/", design_views.design_keep, name="design-keep"),
    path("<uuid:pk>/export/", design_views.design_export_view, name="design-export"),
    path("<uuid:pk>/words/", design_views.design_words, name="design-words"),
    path("<uuid:pk>/styles/", design_views.design_styles, name="design-styles"),
    path("render/<str:token>/", design_views.design_render, name="design-render"),
]
