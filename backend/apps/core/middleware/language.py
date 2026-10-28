"""One language per request, chosen here and nowhere else.

Browsers send their own Accept-Language, so it never decides for a site: a German
browser on a Turkish site still gets Turkish. Creators get their own language,
contentor.app gets the page's, and the superadmin side stays English.
"""

from django.db import connection
from django.utils import translation
from django_tenants.utils import get_public_schema_name

from apps.accounts.authentication import session_claims
from apps.core.languages import CREATOR_ROLES, DEFAULT, creator_language, resolve, site_language

ENGLISH_PREFIXES = ("/django-admin/", "/api/v1/platform-admin/", "/api/v1/platform/")
STILL_TRANSLATED = "/api/v1/platform/blog/"  # the platform blog is public reading


def request_language(request) -> str:
    path = request.path
    if path.startswith(ENGLISH_PREFIXES) and not path.startswith(STILL_TRANSLATED):
        return DEFAULT

    if connection.schema_name == get_public_schema_name():
        cookie = request.COOKIES.get("NEXT_LOCALE")
        return resolve(cookie or translation.get_language_from_request(request))

    claims = session_claims(request)
    if claims and claims.get("role") in CREATOR_ROLES and claims.get("tenant_id") == connection.schema_name:
        if cookie := request.COOKIES.get("user-locale"):
            return resolve(cookie)
        from apps.accounts.models import User

        if user := User.objects.only("preferred_locale").filter(pk=claims.get("user_id")).first():
            return creator_language(user)
    return site_language()


class RequestLanguageMiddleware:
    """Where LocaleMiddleware used to sit, after the tenant middleware."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        language = request_language(request)
        translation.activate(language)
        request.LANGUAGE_CODE = language
        try:
            response = self.get_response(request)
        finally:
            translation.deactivate()
        response.headers["Content-Language"] = language
        return response
