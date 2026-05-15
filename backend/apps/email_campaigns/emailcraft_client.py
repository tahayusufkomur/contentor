import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _base_url() -> str:
    return settings.EMAILCRAFT_BASE_URL.rstrip("/")


def _site_headers() -> dict[str, str]:
    return {
        "Authorization": f"Token {settings.EMAILCRAFT_TOKEN}",
        "Content-Type": "application/json",
    }


def _org_headers(api_key: str) -> dict[str, str]:
    return {
        "X-API-Key": api_key,
        "Content-Type": "application/json",
    }


def _request_with_fallback(
    method: str,
    paths: list[str],
    *,
    headers: dict[str, str],
    timeout: int,
    json: dict | None = None,
    params: dict | None = None,
    fallback_status_codes: set[int] | None = None,
) -> requests.Response:
    """
    Try multiple path variants (e.g. /api/* then /api/v1/*), using the first non-404 response.
    """
    fallback_codes = fallback_status_codes or {404}

    def _variants(path: str) -> list[str]:
        clean = "/" + path.lstrip("/")
        if clean == "/":
            return [clean]
        if clean.endswith("/"):
            return [clean[:-1], clean]
        return [clean, f"{clean}/"]

    expanded_paths: list[str] = []
    for candidate in paths:
        for variant in _variants(candidate):
            if variant not in expanded_paths:
                expanded_paths.append(variant)

    last_response: requests.Response | None = None
    for path in expanded_paths:
        url = f"{_base_url()}{path}"
        response = requests.request(
            method,
            url,
            headers=headers,
            timeout=timeout,
            json=json,
            params=params,
        )
        if response.status_code in fallback_codes:
            last_response = response
            continue
        if not response.ok:
            logger.error(
                "EmailCraft %s %s -> %s: %s",
                method,
                url,
                response.status_code,
                response.text[:500],
            )
        response.raise_for_status()
        return response

    if last_response is not None:
        last_response.raise_for_status()
    raise RuntimeError("EmailCraft request failed without a response.")


def provision_organization(name: str) -> dict:
    response = _request_with_fallback(
        "POST",
        ["/api/site/provision", "/api/v1/site/provision"],
        headers=_site_headers(),
        timeout=30,
        json={"name": name},
    )
    return response.json()


def create_session(api_key: str, origin: str) -> dict:
    response = _request_with_fallback(
        "POST",
        ["/api/auth/session", "/api/v1/auth/session"],
        headers=_org_headers(api_key),
        timeout=15,
        json={"origin": origin},
    )
    return response.json()


def list_templates(api_key: str) -> dict:
    response = _request_with_fallback(
        "GET",
        ["/api/templates", "/api/v1/templates"],
        headers=_org_headers(api_key),
        timeout=15,
    )
    return response.json()


def get_template(api_key: str, template_id: str) -> dict:
    response = _request_with_fallback(
        "GET",
        [f"/api/templates/{template_id}", f"/api/v1/templates/{template_id}"],
        headers=_org_headers(api_key),
        timeout=15,
    )
    return response.json()


def delete_template(api_key: str, template_id: str) -> None:
    _request_with_fallback(
        "DELETE",
        [f"/api/templates/{template_id}", f"/api/v1/templates/{template_id}"],
        headers=_org_headers(api_key),
        timeout=15,
    )


def create_template(api_key: str, name: str, json_data: dict, category: str = "") -> dict:
    payload: dict = {"name": name, "json_data": json_data}
    if category:
        payload["category"] = category
    response = _request_with_fallback(
        "POST",
        ["/api/templates", "/api/v1/templates"],
        headers=_org_headers(api_key),
        timeout=15,
        json=payload,
    )
    return response.json()


def get_template_preview(api_key: str, template_id: str) -> dict:
    response = _request_with_fallback(
        "GET",
        [f"/api/templates/{template_id}/preview", f"/api/v1/templates/{template_id}/preview"],
        headers=_org_headers(api_key),
        timeout=15,
    )
    return response.json()


def export_html(api_key: str, json_data: dict, variables_mode: str = "defaults") -> dict:
    response = _request_with_fallback(
        "POST",
        ["/api/export/html", "/api/v1/export/html"],
        headers=_org_headers(api_key),
        timeout=10,
        json={"json_data": json_data, "variables_mode": variables_mode},
        fallback_status_codes={404, 405},
    )
    return response.json()


def list_gallery(api_key: str, category: str | None = None) -> dict:
    params = {}
    if category:
        params["category"] = category
    response = _request_with_fallback(
        "GET",
        ["/api/gallery", "/api/v1/gallery"],
        headers=_org_headers(api_key),
        timeout=15,
        params=params,
    )
    return response.json()


def configure_variables(org_id: str, variables: list[dict]) -> dict:
    response = _request_with_fallback(
        "PATCH",
        [f"/api/site/organizations/{org_id}/", f"/api/v1/site/organizations/{org_id}/"],
        headers=_site_headers(),
        timeout=15,
        json={"available_variables": variables},
    )
    return response.json()


DEFAULT_VARIABLES = [
    {"key": "Name", "label": "Student Name", "defaultValue": "Student"},
]


def render_template(api_key: str, template_id: str, variables: dict[str, str]) -> dict:
    response = _request_with_fallback(
        "POST",
        ["/api/render", "/api/v1/render"],
        headers=_org_headers(api_key),
        timeout=30,
        json={"template_id": template_id, "variables": variables},
        fallback_status_codes={404, 405},
    )
    return response.json()
