from unittest.mock import patch

import pytest

from apps.accounts.models import User
from apps.courses.models import Course

pytestmark = pytest.mark.django_db(transaction=True)


def test_publishing_a_course_enqueues_fanout(tenant_ctx):
    instructor = User.objects.create_user(
        email="coach@signaltest.com",
        name="Coach",
        password="secret123",
        role="owner",
    )
    course = Course.objects.create(
        title="Yoga 101",
        slug="yoga-101",
        instructor=instructor,
        is_published=False,
    )
    with patch("apps.notifications.signals.fanout_new_content") as task:
        course.is_published = True
        course.save()
    from django.db import connection
    task.delay.assert_called_once_with(course.pk, connection.schema_name)


def test_resaving_published_course_does_not_reenqueue(tenant_ctx):
    instructor = User.objects.create_user(
        email="coach2@signaltest.com",
        name="Coach2",
        password="secret123",
        role="owner",
    )
    course = Course.objects.create(
        title="P",
        slug="p",
        instructor=instructor,
        is_published=True,
    )
    with patch("apps.notifications.signals.fanout_new_content") as task:
        course.title = "P2"
        course.save()
    task.delay.assert_not_called()
