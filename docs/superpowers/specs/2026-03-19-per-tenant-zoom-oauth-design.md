# Per-Tenant Zoom OAuth Design

## Problem

All Zoom meetings are created under a single Zoom account (`users/me/meetings`). OAuth tokens are stored in a global cache. When one coach starts a meeting and another tries to start a second, Zoom returns **Error 3000** ("Already has other meetings in progress") because the same Zoom user can only host one concurrent meeting.

## Solution

Each coach connects their own Zoom account via OAuth. One shared Zoom General App on marketplace.zoom.us — coaches authorize it to access their individual Zoom accounts. Per-tenant OAuth tokens are stored so each coach's meetings run under their own Zoom account.

## Dependencies

- `cryptography>=42.0,<44.0` — required for Fernet encryption of refresh tokens. Must be added to `backend/requirements/base.txt`.

## Zoom App Configuration (marketplace.zoom.us)

- **Single redirect URI:** `https://<platform-domain>/api/v1/auth/zoom/callback/` (e.g. `https://contentor.app/api/v1/auth/zoom/callback/`). No per-tenant redirect URIs needed — the callback resolves tenant from the JWT state parameter, not from the Host header.
- **Required OAuth scopes:** `meeting:write:meeting` (create/end meetings), `user:read:user` (fetch connected email via `GET /users/me`).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Zoom app model | Single shared app, per-tenant OAuth | Standard SaaS pattern. Coaches click "Connect Zoom" without touching Zoom's dev portal. |
| Token storage | Fields on TenantConfig | Follows existing singleton-per-tenant pattern. No new model needed. |
| SDK signature | Shared app credentials | SDK Key identifies the app, not the coach. Separate concern from OAuth tokens. |
| UI location | Admin settings page | Canonical place for tenant configuration. |
| Disconnect guard | Block if meeting is live | Prevents edge cases with orphaned meetings. |
| Redirect URI | Single shared URI for all tenants | Tenant resolved from signed JWT state, not Host header. |
| Account switching | Disconnect first, then reconnect | Connect endpoint returns 400 if `zoom_connected=True`. Coach must disconnect first. |

## Data Model Changes

Three new fields on `TenantConfig`:

| Field | Type | Purpose |
|-------|------|---------|
| `zoom_refresh_token` | `TextField(blank=True, default="")` | Fernet-encrypted refresh token |
| `zoom_connected` | `BooleanField(default=False)` | Whether coach has connected Zoom |
| `zoom_connected_email` | `CharField(max_length=255, blank=True, default="")` | Display: which Zoom account is connected |

Access tokens are cached with tenant-scoped keys: `tenant:{schema_name}:zoom_access_token`. They expire in ~55 minutes and are auto-refreshed from the stored refresh token.

Encryption uses Fernet symmetric encryption via a `ZOOM_TOKEN_ENCRYPTION_KEY` env var. Encryption/decryption happens in the zoom service layer, not in the model.

## OAuth Flow

### Connect Zoom

Follows the same signed-JWT state pattern as the existing Google OAuth flow.

1. **Initiate:** Coach clicks "Connect Zoom" in admin settings -> `POST /api/v1/auth/zoom/` -> backend:
   - Returns 400 if `zoom_connected=True` (must disconnect first to switch accounts)
   - Builds Zoom OAuth URL with a signed JWT state parameter containing `tenant_schema`, `origin` (redirect URL back to settings page), `purpose: "zoom_oauth"`, and `expiry` (10 minutes)
   - Returns the authorization URL

2. **Redirect:** Coach is redirected to Zoom's consent screen where they authorize the app.

3. **Callback:** Zoom redirects to `GET /api/v1/auth/zoom/callback/` with `code` and `state` params -> backend:
   - Verifies and decodes the JWT state — checks `purpose == "zoom_oauth"` (distinct from `"google_oauth"` to prevent cross-flow replay)
   - Sets `connection.set_tenant(tenant)` (callback is AllowAny, tenant resolved from state)
   - Exchanges code for access + refresh tokens
   - Calls `GET /users/me` with the access token to get the coach's Zoom email
   - Stores: `zoom_refresh_token` (encrypted in TenantConfig), `zoom_connected=True`, `zoom_connected_email`
   - Caches access token as `tenant:{schema}:zoom_access_token`
   - **On success:** redirects to `{origin}?zoom=connected`
   - **On failure** (code exchange fails, Zoom API error): redirects to `{origin}?zoom_error=connection_failed`

### Disconnect Zoom

- `POST /api/v1/auth/zoom/disconnect/` (IsCoachOrOwner)
- Checks no LiveClass has `status="live"` -> returns 400 if any are live
- Clears `zoom_refresh_token`, sets `zoom_connected=False`, clears `zoom_connected_email`
- Deletes cached access token

## Zoom Service Changes

### `get_zoom_access_token()`

Becomes tenant-aware:
- Uses `connection.tenant` to resolve current tenant
- Cache key: `tenant:{schema_name}:zoom_access_token`
- On cache miss: acquires a cache-based lock (`cache.add("tenant:{schema}:zoom_refresh_lock", ...)` with ~30s TTL) to prevent concurrent refresh race conditions (Zoom rotates refresh tokens, so two simultaneous refreshes would invalidate each other)
- Loads encrypted `zoom_refresh_token` from TenantConfig, decrypts, refreshes via Zoom OAuth
- Stores rotated refresh token back to TenantConfig
- Raises clear error if `zoom_connected=False`

### `create_zoom_meeting()` / `end_zoom_meeting()`

No signature changes. Internally call the updated `get_zoom_access_token()`.

### `generate_sdk_signature()`

No changes. Keeps using shared `settings.ZOOM_CLIENT_ID` / `settings.ZOOM_CLIENT_SECRET`.

### New: `get_zoom_user_email(token)`

Helper called during OAuth callback. Fetches connected Zoom account email via `GET https://api.zoom.us/v2/users/me`.

## Frontend Changes

### Admin Settings Page

Add a "Zoom Integration" card:
- **Disconnected state:** "Connect Zoom" button. Calls `POST /api/v1/auth/zoom/`, redirects to returned URL.
- **Connected state:** Shows connected email (e.g. "Connected as coach@gmail.com") and "Disconnect" button. Calls `POST /api/v1/auth/zoom/disconnect/`.

### TenantConfig API Response

`GET /api/v1/admin/config/` adds `zoom_connected` and `zoom_connected_email` to the serializer response. `zoom_refresh_token` is **never** exposed to the frontend.

### Live Class Start

No frontend changes. Backend returns a clear error if Zoom is not connected. Frontend already handles error responses.

### Zoom Meeting SDK

No changes. `NEXT_PUBLIC_ZOOM_SDK_KEY` stays as a shared env var. `zoom-meeting-client.tsx` is unchanged.

## Error Handling

| Scenario | Response |
|----------|----------|
| Start class, Zoom not connected | 400: "Connect your Zoom account in Settings before starting a live class." |
| Start class, refresh token revoked | 500: "Your Zoom connection has expired. Please reconnect in Settings." + sets `zoom_connected=False` |
| Disconnect while class is live | 400: "End your live class before disconnecting Zoom." |
| Connect when already connected | 400: "Zoom is already connected. Disconnect first to switch accounts." |
| OAuth callback failure (code exchange) | Redirect to `{origin}?zoom_error=connection_failed` |

The `zoom_connected` check in `live_class_start` is an early-return guard in the view (before calling `create_zoom_meeting`), not inside the zoom service. The zoom service's own "not connected" error remains as defense-in-depth.

## Security

- `zoom_refresh_token` encrypted at rest with Fernet (`ZOOM_TOKEN_ENCRYPTION_KEY` env var)
- `zoom_refresh_token` excluded from TenantConfigSerializer — never sent to frontend
- OAuth state parameter is a signed JWT with 10-minute expiry to prevent CSRF
- Callback uses `@authentication_classes([])` — tenant resolved from state, not Host header
- Cache keys are tenant-scoped — no token leakage between tenants

## Token Lifecycle

- **Access token:** cached ~55 minutes (3600s - 300s buffer), auto-refreshed on next API call
- **Refresh token:** stored encrypted in DB, rotated on each refresh (Zoom's policy), no expiry unless revoked
- **Revocation handling:** if Zoom revokes the refresh token (coach removes app from Zoom marketplace), next refresh fails -> mark `zoom_connected=False`, return error prompting reconnection

## Files to Modify

### Backend
- `apps/tenant_config/models.py` — add 3 fields to TenantConfig
- `apps/tenant_config/serializers.py` — expose `zoom_connected`, `zoom_connected_email` (exclude token)
- `apps/accounts/views.py` — rewrite `zoom_oauth_callback`, add `zoom_oauth_initiate`, add `zoom_disconnect`
- `apps/accounts/urls.py` — add new endpoints
- `apps/live/zoom_service.py` — make `get_zoom_access_token()` tenant-aware, add `get_zoom_user_email()`
- `apps/live/views.py` — add `zoom_connected` check in `live_class_start`
- `config/settings/base.py` — add `ZOOM_TOKEN_ENCRYPTION_KEY` setting
- `backend/requirements/base.txt` — add `cryptography>=42.0,<44.0`
- New migration for TenantConfig field additions (safe defaults: `blank=True, default=""` / `default=False` — compatible with `migrate_schemas` on existing tenants)

### Frontend
- `src/app/admin/live/page.tsx` or admin settings area — add Zoom Integration card

### Environment
- `.env` / `.env.example` — add `ZOOM_TOKEN_ENCRYPTION_KEY`
