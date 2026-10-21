from django.db.models.functions import Lower

from apps.accounts.models import User
from apps.courses.models import Enrollment
from apps.notifications.models import EmailOptOut


def _students():
    """Active students who have not unsubscribed (the opt-outs announcement emails honour too)."""
    opted_out = EmailOptOut.objects.annotate(lower=Lower("email")).values("lower")
    return (
        User.objects.filter(role="student", is_active=True)
        .annotate(email_lower=Lower("email"))
        .exclude(email_lower__in=opted_out)
    )


def resolve_recipients(recipient_filter: dict):
    """
    Resolve a recipient filter into a deduplicated queryset of active student users who still want email.
    """
    if not isinstance(recipient_filter, dict):
        return User.objects.none()

    filter_type = recipient_filter.get("type")

    if filter_type == "all":
        return _students()

    if filter_type == "course":
        course_ids = recipient_filter.get("course_ids") or []
        if not course_ids:
            return User.objects.none()
        user_ids = (
            Enrollment.objects.filter(course_id__in=course_ids, is_active=True)
            .values_list("user_id", flat=True)
            .distinct()
        )
        return _students().filter(pk__in=user_ids)

    if filter_type == "individual":
        user_ids = recipient_filter.get("user_ids") or []
        if not user_ids:
            return User.objects.none()
        return _students().filter(pk__in=user_ids)

    return User.objects.none()


def get_recipient_count(recipient_filter: dict) -> int:
    return resolve_recipients(recipient_filter).count()
