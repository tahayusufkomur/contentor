from django.db import connection
from django.db.models.signals import post_save, pre_delete, pre_save
from django.dispatch import receiver
from django.utils import timezone

from apps.courses.models import Course

from .tasks import fanout_new_content


@receiver(pre_save, sender=Course)
def _track_publish_transition(sender, instance, **kwargs):
    if not instance.pk:
        instance._was_published = False
        return
    prev = sender.objects.filter(pk=instance.pk).values_list("is_published", flat=True).first()
    instance._was_published = bool(prev)


@receiver(post_save, sender=Course)
def _notify_on_publish(sender, instance, created, **kwargs):
    became_published = instance.is_published and not getattr(instance, "_was_published", False)
    if became_published:
        fanout_new_content.delay(instance.pk, connection.schema_name)


# Ticket holders hear when their class moves or is called off, whoever changed it (the admin,
# the copilot, a series edit).
_CLASS_MODELS = ("LiveClass", "LiveStream", "ZoomClass", "OnsiteEvent")


def _is_class(sender) -> bool:
    return sender.__name__ in _CLASS_MODELS and sender._meta.app_label == "live"


@receiver(pre_save)
def _track_class_time(sender, instance, **kwargs):
    if _is_class(sender) and instance.pk:
        instance._was_at = sender.objects.filter(pk=instance.pk).values_list("scheduled_at", flat=True).first()


@receiver(post_save)
def _class_moved(sender, instance, created, **kwargs):
    if not _is_class(sender) or created:
        return
    was, at = getattr(instance, "_was_at", None), instance.scheduled_at
    if was and at and at != was and at > timezone.now() and instance.status != "draft":
        from . import transactional

        transactional.class_event("changed", instance)


@receiver(pre_delete)
def _class_cancelled(sender, instance, **kwargs):
    if _is_class(sender) and instance.scheduled_at and instance.scheduled_at > timezone.now():
        from . import transactional

        transactional.class_event("cancelled", instance)
