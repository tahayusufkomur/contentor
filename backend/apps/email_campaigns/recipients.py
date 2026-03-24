from apps.accounts.models import User
from apps.courses.models import Enrollment


def resolve_recipients(recipient_filter: dict):
    """
    Resolve a recipient filter into a deduplicated queryset of active student users.
    """
    if not isinstance(recipient_filter, dict):
        return User.objects.none()

    filter_type = recipient_filter.get("type")

    if filter_type == "all":
        return User.objects.filter(role="student", is_active=True)

    if filter_type == "course":
        course_ids = recipient_filter.get("course_ids") or []
        if not course_ids:
            return User.objects.none()
        user_ids = (
            Enrollment.objects.filter(course_id__in=course_ids, is_active=True)
            .values_list("user_id", flat=True)
            .distinct()
        )
        return User.objects.filter(pk__in=user_ids, role="student", is_active=True)

    if filter_type == "individual":
        user_ids = recipient_filter.get("user_ids") or []
        if not user_ids:
            return User.objects.none()
        return User.objects.filter(pk__in=user_ids, role="student", is_active=True)

    return User.objects.none()


def get_recipient_count(recipient_filter: dict) -> int:
    return resolve_recipients(recipient_filter).count()
