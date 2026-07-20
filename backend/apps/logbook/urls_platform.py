from django.urls import path

from .views import ingest, panel

urlpatterns = [
    path("logs/ingest/", ingest.logs_ingest, name="logbook-ingest"),
    path("logs/facets/", panel.platform_logs_facets, name="logbook-logs-facets"),
    path("logs/", panel.platform_logs, name="logbook-logs"),
    path("activity/facets/", panel.platform_activity_facets, name="logbook-activity-facets"),
    path("activity/", panel.platform_activity, name="logbook-activity"),
]
