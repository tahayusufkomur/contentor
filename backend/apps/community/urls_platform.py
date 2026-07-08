from django.urls import path

from . import platform_views

urlpatterns = [
    path("reports/", platform_views.community_reports_rollup, name="platform-community-reports"),
]
