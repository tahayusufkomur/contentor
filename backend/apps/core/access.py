import logging

logger = logging.getLogger(__name__)


def can_access(user, content) -> bool:
    if user.role in ("owner", "coach"):
        return True
    access_type = getattr(content, "access_type", "free")
    if access_type == "free":
        return True
    if access_type == "subscription":
        try:
            from apps.billing.models import Subscription
            return Subscription.objects.filter(user=user, status="active").exists()
        except ImportError:
            logger.debug("Billing app not installed, denying subscription access")
            return False
    if access_type == "paid":
        if hasattr(content, "enrollments"):
            return content.enrollments.filter(user=user).exists()
        return False
    return False
