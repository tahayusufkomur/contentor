import os

from celery import Celery
from celery.schedules import crontab
from celery.signals import setup_logging

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
app = Celery("contentor")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "send-live-reminders": {
        "task": "apps.notifications.tasks.send_live_reminders",
        "schedule": crontab(minute="*/5"),
    },
    "dispatch-due-announcements": {
        "task": "apps.notifications.tasks.dispatch_due_announcements",
        "schedule": crontab(minute="*"),
    },
    "dispatch-due-recurrences": {
        "task": "apps.notifications.tasks.dispatch_due_recurrences",
        "schedule": crontab(minute="*"),
    },
}


@setup_logging.connect
def configure_logging(**kwargs):
    """Use Django's LOGGING config in the worker/beat instead of celery's own
    handlers, so task-side app events land in the same stdout stream/format as
    the web process (paired with CELERY_WORKER_HIJACK_ROOT_LOGGER = False)."""
    from logging.config import dictConfig

    from django.conf import settings

    dictConfig(settings.LOGGING)
