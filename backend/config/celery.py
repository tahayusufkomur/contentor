import os

from celery import Celery
from celery.schedules import crontab
from celery.signals import setup_logging, task_prerun

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
app = Celery("contentor")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "send-live-reminders": {
        "task": "apps.notifications.tasks.send_live_reminders",
        "schedule": crontab(minute="*/5"),
    },
    "send-access-ending-emails": {
        "task": "apps.notifications.tasks.send_access_ending_emails",
        "schedule": crontab(hour="9", minute="10"),
    },
    "dispatch-due-announcements": {
        "task": "apps.notifications.tasks.dispatch_due_announcements",
        "schedule": crontab(minute="*"),
    },
    "dispatch-due-recurrences": {
        "task": "apps.notifications.tasks.dispatch_due_recurrences",
        "schedule": crontab(minute="*"),
    },
    "dispatch-due-blog-autopilot": {
        "task": "apps.blog.tasks.dispatch_due_blog_autopilot",
        "schedule": crontab(minute="*/15"),
    },
    "dispatch-due-email-campaigns": {
        "task": "apps.email_campaigns.tasks.dispatch_due_email_campaigns",
        "schedule": crontab(minute="*"),
    },
    "sweep-own-photos": {
        "task": "apps.core.tasks.sweep_own_photos",
        "schedule": crontab(minute="*/15"),
    },
    "sweep-captions": {
        "task": "apps.courses.tasks.sweep_captions",
        "schedule": crontab(minute="*/5"),
    },
    "purge-ai-transcripts": {
        "task": "apps.core.tasks.purge_ai_transcripts",
        "schedule": crontab(hour="4", minute="20"),
    },
    "send-wizard-recovery-emails": {
        "task": "apps.core.tasks.send_wizard_recovery_emails",
        "schedule": crontab(minute="25"),
    },
    "cleanup-abandoned-signups": {
        "task": "apps.core.tasks.cleanup_abandoned_signups",
        "schedule": crontab(hour="4", minute="40"),
    },
    "logbook-archive": {
        "task": "apps.logbook.tasks.archive_logbook_days",
        "schedule": crontab(hour="3", minute="40"),
    },
    "logbook-purge": {
        "task": "apps.logbook.tasks.purge_logbook",
        "schedule": crontab(hour="4", minute="20"),
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


@task_prerun.connect
def start_in_default_language(**kwargs):
    """A worker process is reused: a task starts in English, not in the language
    the previous task activated. Tasks that need another pick it with translation.override."""
    from django.conf import settings
    from django.utils import translation

    translation.activate(settings.LANGUAGE_CODE)
