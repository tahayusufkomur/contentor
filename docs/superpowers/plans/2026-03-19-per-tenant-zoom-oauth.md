# Per-Tenant Zoom OAuth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each coach connect their own Zoom account so multiple coaches can run concurrent live classes without Zoom Error 3000.

**Architecture:** Add 3 fields to TenantConfig for per-tenant Zoom OAuth tokens. Rewrite zoom_service.py to use tenant-scoped tokens with cache-based locking. Add OAuth initiate/callback/disconnect endpoints following the existing Google OAuth state-JWT pattern.

**Tech Stack:** Django 5.1, django-tenants, cryptography (Fernet), PyJWT, Next.js 15, React

**Spec:** `docs/superpowers/specs/2026-03-19-per-tenant-zoom-oauth-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/requirements/base.txt` | Modify | Add cryptography dependency |
| `backend/config/settings/base.py` | Modify | Add ZOOM_TOKEN_ENCRYPTION_KEY setting |
| `.env` / `.env.example` | Modify | Add ZOOM_TOKEN_ENCRYPTION_KEY env var |
| `backend/apps/tenant_config/models.py` | Modify | Add zoom_refresh_token, zoom_connected, zoom_connected_email fields |
| `backend/apps/tenant_config/serializers.py` | Modify | Expose zoom_connected and zoom_connected_email (exclude token) |
| `backend/apps/live/zoom_service.py` | Rewrite | Tenant-aware token management with Fernet encryption and cache lock |
| `backend/apps/accounts/views.py` | Modify | Add zoom_oauth_initiate, rewrite zoom_oauth_callback, add zoom_disconnect |
| `backend/apps/accounts/urls.py` | Modify | Add zoom/ and zoom/disconnect/ routes |
| `backend/apps/live/views.py` | Modify | Add zoom_connected guard in live_class_start |
| `frontend-customer/src/app/admin/live/page.tsx` | Modify | Add Zoom Integration card |

---

## Chunk 1: Backend Infrastructure

### Task 1: Add cryptography dependency

**Files:**
- Modify: `backend/requirements/base.txt:14`

- [ ] **Step 1: Add cryptography to requirements**

Add at the end of `backend/requirements/base.txt`:

```
cryptography>=42.0,<44.0
```

- [ ] **Step 2: Install the dependency**

Run: `cd /Users/tahayusufkomur/ws/workdir-contentor-customerapp/contentor && pip install cryptography>=42.0,<44.0`
Expected: Successfully installed cryptography-XX.X.X

- [ ] **Step 3: Commit**

```bash
git add backend/requirements/base.txt
git commit -m "chore: add cryptography dependency for Zoom token encryption"
```

---

### Task 2: Add ZOOM_TOKEN_ENCRYPTION_KEY setting

**Files:**
- Modify: `backend/config/settings/base.py:161-164`
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: Generate a Fernet key for dev use**

Run: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

Store the output — you'll add it to `.env`.

- [ ] **Step 2: Add setting to base.py**

After line 164 (`ZOOM_REDIRECT_URI = ...`), add:

```python
ZOOM_TOKEN_ENCRYPTION_KEY = os.environ.get("ZOOM_TOKEN_ENCRYPTION_KEY", "")
```

- [ ] **Step 3: Add to .env.example**

After the `NEXT_PUBLIC_ZOOM_SDK_KEY=` line, add:

```
# Fernet key for encrypting Zoom refresh tokens (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
ZOOM_TOKEN_ENCRYPTION_KEY=
```

- [ ] **Step 4: Add to .env**

After the `ZOOM_SECRET_TOKEN` line, add (using the key generated in step 1):

```
ZOOM_TOKEN_ENCRYPTION_KEY=<generated-key-here>
```

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings/base.py .env.example
git commit -m "chore: add ZOOM_TOKEN_ENCRYPTION_KEY setting"
```

Do NOT commit `.env` (it contains secrets).

---

### Task 3: Add Zoom fields to TenantConfig model

**Files:**
- Modify: `backend/apps/tenant_config/models.py:25`

- [ ] **Step 1: Add the three new fields**

After line 25 (`onboarding_completed = models.BooleanField(default=False)`), add:

```python
    # Zoom OAuth (per-tenant)
    zoom_refresh_token = models.TextField(blank=True, default="")
    zoom_connected = models.BooleanField(default=False)
    zoom_connected_email = models.CharField(max_length=255, blank=True, default="")
```

- [ ] **Step 2: Create the migration**

Run: `cd /Users/tahayusufkomur/ws/workdir-contentor-customerapp/contentor/backend && python manage.py makemigrations tenant_config -n add_zoom_oauth_fields`

Expected: Creates a migration file with three AddField operations.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/tenant_config/models.py backend/apps/tenant_config/migrations/
git commit -m "feat: add Zoom OAuth fields to TenantConfig model"
```

---

### Task 4: Expose Zoom fields in TenantConfig serializer

**Files:**
- Modify: `backend/apps/tenant_config/serializers.py:25-39`

- [ ] **Step 1: Add zoom_connected and zoom_connected_email to fields list**

In the `Meta.fields` list, after `"onboarding_completed"`, add:

```python
            "zoom_connected",
            "zoom_connected_email",
```

The fields list should end with:

```python
        fields = [
            "id",
            "brand_name",
            "logo_url",
            "theme",
            "dark_mode_enabled",
            "font_family",
            "custom_css",
            "enabled_modules",
            "social_links",
            "meta_description",
            "navbar_config",
            "landing_sections",
            "onboarding_completed",
            "zoom_connected",
            "zoom_connected_email",
        ]
```

Note: `zoom_refresh_token` is deliberately excluded — it must never be sent to the frontend.

- [ ] **Step 2: Commit**

```bash
git add backend/apps/tenant_config/serializers.py
git commit -m "feat: expose zoom_connected and zoom_connected_email in TenantConfig API"
```

---

### Task 5: Rewrite zoom_service.py to be tenant-aware

**Files:**
- Rewrite: `backend/apps/live/zoom_service.py`

- [ ] **Step 1: Replace the entire file content**

Replace all of `backend/apps/live/zoom_service.py` with:

```python
"""Zoom Meeting SDK integration for live class management.

Per-tenant OAuth: each tenant stores its own encrypted Zoom refresh token
in TenantConfig. Access tokens are cached with tenant-scoped keys.
"""

import base64
import logging
import time

import jwt
import requests as http_requests
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.cache import cache
from django.db import connection

logger = logging.getLogger(__name__)

ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token"  # noqa: S105
ZOOM_API_BASE = "https://api.zoom.us/v2"


def _get_fernet() -> Fernet:
    """Return a Fernet instance using the configured encryption key."""
    key = settings.ZOOM_TOKEN_ENCRYPTION_KEY
    if not key:
        raise RuntimeError("ZOOM_TOKEN_ENCRYPTION_KEY is not configured.")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token for database storage."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a token from database storage."""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise RuntimeError("Failed to decrypt Zoom token. Key may have changed.")


def _tenant_cache_key(suffix: str) -> str:
    """Build a tenant-scoped cache key."""
    schema = connection.tenant.schema_name
    return f"tenant:{schema}:{suffix}"


def get_zoom_access_token() -> str:
    """Get a per-tenant OAuth access token, refreshing if expired.

    Uses a cache-based lock to prevent concurrent refresh race conditions
    (Zoom rotates refresh tokens on each use).
    """
    from apps.tenant_config.models import TenantConfig

    cache_key = _tenant_cache_key("zoom_access_token")
    cached = cache.get(cache_key)
    if cached:
        return cached

    config = TenantConfig.objects.first()
    if not config or not config.zoom_connected:
        raise RuntimeError(
            "Connect your Zoom account in Settings before starting a live class."
        )

    if not config.zoom_refresh_token:
        config.zoom_connected = False
        config.save(update_fields=["zoom_connected"])
        raise RuntimeError(
            "Your Zoom connection has expired. Please reconnect in Settings."
        )

    # Acquire lock to prevent concurrent refresh (30s TTL)
    lock_key = _tenant_cache_key("zoom_refresh_lock")
    if not cache.add(lock_key, "1", timeout=30):
        # Another request is refreshing — wait briefly and retry from cache
        time.sleep(2)
        cached = cache.get(cache_key)
        if cached:
            return cached
        raise RuntimeError("Zoom token refresh in progress. Please try again.")

    try:
        refresh_token = decrypt_token(config.zoom_refresh_token)

        credentials = base64.b64encode(
            f"{settings.ZOOM_CLIENT_ID}:{settings.ZOOM_CLIENT_SECRET}".encode()
        ).decode()

        res = http_requests.post(
            ZOOM_OAUTH_TOKEN_URL,
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            timeout=10,
        )

        if res.status_code != 200:
            logger.error("Zoom token refresh failed (%s): %s", res.status_code, res.text)
            config.zoom_connected = False
            config.zoom_connected_email = ""
            config.zoom_refresh_token = ""
            config.save(update_fields=["zoom_connected", "zoom_connected_email", "zoom_refresh_token"])
            raise RuntimeError(
                "Your Zoom connection has expired. Please reconnect in Settings."
            )

        data = res.json()
        token = data["access_token"]
        expires_in = data.get("expires_in", 3600)
        cache.set(cache_key, token, timeout=max(expires_in - 300, 60))

        # Zoom rotates refresh tokens — store the new one
        if "refresh_token" in data:
            config.zoom_refresh_token = encrypt_token(data["refresh_token"])
            config.save(update_fields=["zoom_refresh_token"])

        logger.info("Zoom OAuth token refreshed for tenant %s", connection.tenant.schema_name)
        return token
    finally:
        cache.delete(lock_key)


def create_zoom_meeting(
    title: str,
    *,
    waiting_room: bool = True,
    mute_on_entry: bool = True,
    auto_recording: str = "none",
    chat_scope: str = "everyone",
    screen_sharing: str = "host",
    participant_video: bool = True,
    duration: int = 60,
) -> dict:
    """Create a Zoom meeting. Returns dict with meeting_id, passcode, join_url."""
    token = get_zoom_access_token()

    meeting_settings = {
        "host_video": True,
        "participant_video": participant_video,
        "join_before_host": False,
        "mute_upon_entry": mute_on_entry,
        "auto_recording": auto_recording,
        "waiting_room": waiting_room,
        "who_can_share_screen": screen_sharing,
        "meeting_chat": {
            "enable": True,
            "allow_participants_chat_with": 1 if chat_scope == "host_only" else 3,
        },
    }

    res = http_requests.post(
        f"{ZOOM_API_BASE}/users/me/meetings",
        json={
            "topic": title,
            "type": 2,
            "duration": duration,
            "settings": meeting_settings,
        },
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        timeout=10,
    )
    if res.status_code != 201:
        logger.error("Zoom create meeting failed (%s): %s", res.status_code, res.text)
    res.raise_for_status()
    data = res.json()
    logger.info("Zoom meeting created: %s", data["id"])

    return {
        "meeting_id": str(data["id"]),
        "passcode": data.get("password", ""),
        "join_url": data.get("join_url", ""),
    }


def end_zoom_meeting(meeting_id: str) -> None:
    """End a running Zoom meeting via API."""
    token = get_zoom_access_token()
    try:
        res = http_requests.put(
            f"{ZOOM_API_BASE}/meetings/{meeting_id}/status",
            json={"action": "end"},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        res.raise_for_status()
        logger.info("Zoom meeting %s ended via API", meeting_id)
    except Exception:
        logger.warning("Could not end Zoom meeting %s via API", meeting_id)


def generate_sdk_signature(meeting_number: str, role: int) -> str:
    """Generate a Meeting SDK JWT signature.

    role: 1 = host, 0 = attendee
    Uses shared app credentials (SDK Key identifies the app, not the coach).
    """
    iat = int(time.time()) - 30
    exp = iat + 60 * 60 * 2  # 2 hours

    payload = {
        "appKey": settings.ZOOM_CLIENT_ID,
        "sdkKey": settings.ZOOM_CLIENT_ID,
        "mn": meeting_number,
        "role": role,
        "iat": iat,
        "exp": exp,
        "tokenExp": exp,
    }

    return jwt.encode(payload, settings.ZOOM_CLIENT_SECRET, algorithm="HS256")


def get_zoom_user_email(access_token: str) -> str:
    """Fetch the Zoom user's email from the /users/me endpoint."""
    res = http_requests.get(
        f"{ZOOM_API_BASE}/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    res.raise_for_status()
    return res.json().get("email", "")
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/live/zoom_service.py
git commit -m "feat: rewrite zoom_service to use per-tenant OAuth tokens"
```

---

### Task 6: Add zoom_connected guard to live_class_start

**Files:**
- Modify: `backend/apps/live/views.py:62-68`

- [ ] **Step 1: Add the guard**

After line 68 (the status check closing paren), before line 70 (`try:`), add:

```python

    # Check Zoom is connected for this tenant
    from apps.tenant_config.models import TenantConfig

    tenant_config = TenantConfig.objects.first()
    if not tenant_config or not tenant_config.zoom_connected:
        return Response(
            {"detail": "Connect your Zoom account in Settings before starting a live class."},
            status=status.HTTP_400_BAD_REQUEST,
        )

```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/live/views.py
git commit -m "feat: add zoom_connected guard before starting live class"
```

---

## Chunk 2: OAuth Endpoints

### Task 7: Add Zoom OAuth initiate, callback, and disconnect views

**Files:**
- Modify: `backend/apps/accounts/views.py:128-147` (refactor state helpers), `272-326` (rewrite callback)
- Modify: `backend/apps/accounts/urls.py`

- [ ] **Step 1: Refactor OAuth state helpers to support multiple purposes**

Replace lines 128-147 in `accounts/views.py`:

```python
def _create_oauth_state(tenant_schema: str, origin: str) -> str:
```

through:

```python
    return payload
```

With this generalized version:

```python
def _create_oauth_state(tenant_schema: str, origin: str, purpose: str = "google_oauth") -> str:
    """Create a signed JWT containing OAuth state (no cookies needed)."""
    from datetime import datetime, timedelta

    payload = {
        "tenant": tenant_schema,
        "origin": origin,
        "purpose": purpose,
        "exp": datetime.now(tz=UTC) + timedelta(minutes=10),
        "iat": datetime.now(tz=UTC),
    }
    return jwt_lib.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _verify_oauth_state(state: str, expected_purpose: str = "google_oauth") -> dict:
    """Verify and decode the signed OAuth state."""
    payload = jwt_lib.decode(state, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("purpose") != expected_purpose:
        raise jwt_lib.InvalidTokenError("Invalid state purpose")
    return payload
```

- [ ] **Step 2: Replace the zoom_oauth_callback view**

Replace the entire `zoom_oauth_callback` function (lines 272-326) with these three new views:

```python
ZOOM_AUTH_URL = "https://zoom.us/oauth/authorize"


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def zoom_oauth_initiate(request):
    """Start Zoom OAuth flow — returns authorization URL."""
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first()
    if config and config.zoom_connected:
        return Response(
            {"detail": "Zoom is already connected. Disconnect first to switch accounts."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tenant = connection.tenant
    origin = request.data.get("origin", "")
    state = _create_oauth_state(tenant.schema_name, origin, purpose="zoom_oauth")

    params = {
        "client_id": settings.ZOOM_CLIENT_ID,
        "redirect_uri": settings.ZOOM_REDIRECT_URI,
        "response_type": "code",
        "state": state,
    }

    return Response({"url": f"{ZOOM_AUTH_URL}?{urlencode(params)}"})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def zoom_oauth_callback(request):
    """Handle Zoom OAuth redirect — exchange code for tokens, store per-tenant."""
    code = request.query_params.get("code")
    state = request.query_params.get("state")

    # Best-effort origin extraction for error redirects
    origin = ""
    if state:
        try:
            state_data = _verify_oauth_state(state, expected_purpose="zoom_oauth")
            origin = state_data.get("origin", "")
        except Exception:
            pass

    if not code or not state:
        return HttpResponseRedirect(f"{origin}/admin/live?zoom_error=invalid_request")

    # Verify signed state
    try:
        state_data = _verify_oauth_state(state, expected_purpose="zoom_oauth")
    except Exception:
        return HttpResponseRedirect(f"{origin}/admin/live?zoom_error=invalid_state")

    tenant_schema = state_data["tenant"]
    origin = state_data["origin"]

    # Resolve tenant from state
    from apps.core.models import Tenant

    try:
        tenant = Tenant.objects.get(schema_name=tenant_schema)
    except Tenant.DoesNotExist:
        return HttpResponseRedirect(f"{origin}/admin/live?zoom_error=tenant_mismatch")

    # Switch to tenant schema
    from django.db import connection as db_connection

    db_connection.set_tenant(tenant)

    # Exchange code for tokens
    import base64

    credentials = base64.b64encode(
        f"{settings.ZOOM_CLIENT_ID}:{settings.ZOOM_CLIENT_SECRET}".encode()
    ).decode()

    token_response = http_requests.post(
        "https://zoom.us/oauth/token",
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.ZOOM_REDIRECT_URI,
        },
        timeout=10,
    )

    if token_response.status_code != 200:
        logger.error("Zoom token exchange failed: %s", token_response.text)
        return HttpResponseRedirect(f"{origin}/admin/live?zoom_error=connection_failed")

    tokens = token_response.json()
    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token", "")

    # Fetch connected Zoom email
    from apps.live.zoom_service import encrypt_token, get_zoom_user_email

    try:
        zoom_email = get_zoom_user_email(access_token)
    except Exception:
        logger.exception("Failed to fetch Zoom user email")
        zoom_email = ""

    # Store per-tenant
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first()
    if not config:
        logger.error("No TenantConfig found for tenant %s during Zoom OAuth", tenant_schema)
        return HttpResponseRedirect(f"{origin}/admin/live?zoom_error=connection_failed")

    config.zoom_refresh_token = encrypt_token(refresh_token)
    config.zoom_connected = True
    config.zoom_connected_email = zoom_email
    config.save(update_fields=["zoom_refresh_token", "zoom_connected", "zoom_connected_email"])

    # Cache access token
    from django.core.cache import cache

    expires_in = tokens.get("expires_in", 3600)
    cache_key = f"tenant:{tenant_schema}:zoom_access_token"
    cache.set(cache_key, access_token, timeout=max(expires_in - 300, 60))

    logger.info("Zoom OAuth connected for tenant %s (%s)", tenant_schema, zoom_email)
    return HttpResponseRedirect(f"{origin}/admin/live?zoom=connected")


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def zoom_disconnect(request):
    """Disconnect Zoom account for the current tenant."""
    from apps.live.models import LiveClass
    from apps.tenant_config.models import TenantConfig

    # Block if any class is live
    if LiveClass.objects.filter(status="live").exists():
        return Response(
            {"detail": "End your live class before disconnecting Zoom."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    config = TenantConfig.objects.first()
    if config:
        config.zoom_refresh_token = ""
        config.zoom_connected = False
        config.zoom_connected_email = ""
        config.save(update_fields=["zoom_refresh_token", "zoom_connected", "zoom_connected_email"])

    # Clear cached access token
    from django.core.cache import cache

    cache_key = f"tenant:{connection.tenant.schema_name}:zoom_access_token"
    cache.delete(cache_key)

    return Response({"detail": "Zoom disconnected."})
```

- [ ] **Step 3: Add required imports to accounts/views.py**

At the top of `accounts/views.py`, add these two imports (they are NOT currently present in the file):

```python
from django.db import connection
from apps.core.permissions import IsCoachOrOwner
```

These are required by `zoom_oauth_initiate` and `zoom_disconnect` which use `@permission_classes([IsCoachOrOwner])` and `connection.tenant`.

**Note:** The refactored `_create_oauth_state` and `_verify_oauth_state` use default parameter values (`purpose="google_oauth"` and `expected_purpose="google_oauth"`) so the existing `google_login` and `google_callback` calls continue to work without changes.

- [ ] **Step 4: Update accounts/urls.py**

Replace `accounts/urls.py` content with:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("magic-link/", views.magic_link_request, name="magic-link-request"),
    path("magic-link/verify/", views.magic_link_verify, name="magic-link-verify"),
    path("google/", views.google_login, name="google-login"),
    path("google/callback/", views.google_callback, name="google-callback"),
    path("zoom/", views.zoom_oauth_initiate, name="zoom-oauth-initiate"),
    path("zoom/callback/", views.zoom_oauth_callback, name="zoom-oauth-callback"),
    path("zoom/disconnect/", views.zoom_disconnect, name="zoom-disconnect"),
    path("logout/", views.logout, name="logout"),
    path("users/me/", views.me, name="user-me"),
    path("users/me/update/", views.update_me, name="user-update"),
]
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/views.py backend/apps/accounts/urls.py
git commit -m "feat: add Zoom OAuth initiate, callback, and disconnect endpoints"
```

---

## Chunk 3: Frontend

### Task 8: Add Zoom Integration card to admin live page

**Files:**
- Modify: `frontend-customer/src/app/admin/live/page.tsx`

- [ ] **Step 1: Add Zoom connection state and handlers**

In `LiveClassesPage`, after the existing state declarations (after line 86 `const [duration, setDuration] = useState(60);`), add:

```tsx
  const [zoomConnected, setZoomConnected] = useState(false);
  const [zoomEmail, setZoomEmail] = useState("");
  const [zoomLoading, setZoomLoading] = useState(false);
```

- [ ] **Step 2: Fetch Zoom status from TenantConfig**

After the `fetchClasses` useCallback, add:

```tsx
  useEffect(() => {
    clientFetch<{ zoom_connected: boolean; zoom_connected_email: string }>(
      "/api/v1/admin/config/"
    ).then((data) => {
      setZoomConnected(data.zoom_connected);
      setZoomEmail(data.zoom_connected_email);
    }).catch(() => {});
  }, []);
```

- [ ] **Step 3: Handle query params for Zoom connection result**

After the config fetch useEffect, add:

```tsx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("zoom") === "connected") {
      setZoomConnected(true);
      // Re-fetch config to get email
      clientFetch<{ zoom_connected: boolean; zoom_connected_email: string }>(
        "/api/v1/admin/config/"
      ).then((data) => {
        setZoomConnected(data.zoom_connected);
        setZoomEmail(data.zoom_connected_email);
      }).catch(() => {});
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("zoom_error")) {
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
```

- [ ] **Step 4: Add connect/disconnect handlers**

After the `handleDelete` function, add:

```tsx
  async function handleZoomConnect() {
    setZoomLoading(true);
    try {
      const data = await clientFetch<{ url: string }>("/api/v1/auth/zoom/", {
        method: "POST",
        body: JSON.stringify({ origin: window.location.origin }),
      });
      window.location.href = data.url;
    } catch {
      setZoomLoading(false);
    }
  }

  async function handleZoomDisconnect() {
    setZoomLoading(true);
    try {
      await clientFetch("/api/v1/auth/zoom/disconnect/", { method: "POST" });
      setZoomConnected(false);
      setZoomEmail("");
    } catch {
      // ignore
    } finally {
      setZoomLoading(false);
    }
  }
```

- [ ] **Step 5: Add the Zoom Integration card to the JSX**

Inside the return, right after the header `<div>` (after the closing `</div>` of the flex items-center justify-between div, before `{showCreate && (`), add:

```tsx
      {!zoomConnected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Connect your Zoom account
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Required to host live classes. Each coach needs their own Zoom
                connection.
              </p>
            </div>
            <Button
              onClick={handleZoomConnect}
              disabled={zoomLoading}
              variant="outline"
              className="shrink-0"
            >
              {zoomLoading ? "Connecting..." : "Connect Zoom"}
            </Button>
          </div>
        </div>
      )}

      {zoomConnected && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">Zoom connected</span>
              {zoomEmail && (
                <span className="text-sm text-muted-foreground">
                  ({zoomEmail})
                </span>
              )}
            </div>
            <Button
              onClick={handleZoomDisconnect}
              disabled={zoomLoading}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Add ApiError import and update handleStart for Zoom not connected**

Add the `ApiError` import at the top of the file, alongside the existing `clientFetch` import:

```tsx
import { ApiError } from "@/types/api";
```

Then replace the existing `handleStart` function:

```tsx
  async function handleStart(id: number) {
    try {
      await clientFetch(`/api/v1/live/${id}/start/`, { method: "POST" });
      router.push(`/live/${id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // Likely Zoom not connected — refresh state
        clientFetch<{ zoom_connected: boolean; zoom_connected_email: string }>(
          "/api/v1/admin/config/"
        ).then((data) => {
          setZoomConnected(data.zoom_connected);
          setZoomEmail(data.zoom_connected_email);
        }).catch(() => {});
      }
    }
  }
```

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/app/admin/live/page.tsx
git commit -m "feat: add Zoom connect/disconnect UI to live classes admin"
```

---

### Task 9: Verify and test

- [ ] **Step 1: Run backend checks**

Run: `cd /Users/tahayusufkomur/ws/workdir-contentor-customerapp/contentor && make dev` (or equivalent dev startup)

Verify Django starts without migration errors.

- [ ] **Step 2: Run migrations**

Run: `python manage.py migrate_schemas`

Expected: Migrations apply successfully to all existing tenant schemas.

- [ ] **Step 3: Verify frontend builds**

Run: `cd /Users/tahayusufkomur/ws/workdir-contentor-customerapp/contentor/frontend-customer && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Manual smoke test**

1. Navigate to admin live classes page
2. Verify "Connect your Zoom account" banner appears
3. Click "Connect Zoom" — should redirect to Zoom authorization
4. After authorizing, should redirect back with `?zoom=connected`
5. Verify connected state shows with email
6. Try "Go Live" — should work with the coach's own Zoom account
7. Try "Disconnect" — should work (unless a class is live)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: per-tenant Zoom OAuth — complete implementation"
```
