from django.db import connection
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

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
