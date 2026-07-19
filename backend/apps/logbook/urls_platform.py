from django.urls import path

from .views import ingest

urlpatterns = [
    path("logs/ingest/", ingest.logs_ingest, name="logbook-ingest"),
]
