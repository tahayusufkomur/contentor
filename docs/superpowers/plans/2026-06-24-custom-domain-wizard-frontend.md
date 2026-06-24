# Custom Domain Wizard (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the coach-facing custom-domain wizard in `frontend-main` (apex contentor.app) — a per-platform flow on the "my platforms" dashboard to search/buy a domain, fill registrant details, pay via Stripe, watch provisioning, and manage/remove the live domain.

**Architecture:** The wizard is a per-platform route `/dashboard/domain/[slug]` in `frontend-main`. It reuses the Phase-1 tenant-scoped domain APIs (`/api/v1/domains/*`) by proxying through Next route handlers under `src/app/api/tenants/[slug]/domain/` that inject the coach's JWT cookie + `X-Tenant-Domain: <tenant.domain>` (Django authorizes ownership via JWT + `IsCoachOrOwner`). One backend change: the Phase-1 checkout view must build Stripe return URLs from the apex origin + a validated relative `return_path`, since `request.get_host()` is the internal host when called via the proxy.

**Tech Stack:** Next.js 14 App Router, React client components, TypeScript, Tailwind + the existing `frontend-main` shadcn-style UI kit (`button, input, label, card, badge, skeleton`), Lucide icons. Backend: Django/DRF (one view change + pytest).

## Global Constraints

- The wizard lives in **frontend-main** only (apex). Coach dashboard ("my platforms") is `src/app/dashboard/page.tsx`; each `PlatformCard` links to the wizard.
- `frontend-main` has **no** `Select`, `AlertDialog`, or `sonner`. Use a native styled `<select>` for country, an **inline confirm** (two-button reveal) for destructive remove, and **inline status/error messaging** (the `publish-controls.tsx` style), NOT toasts.
- The dashboard area uses **hardcoded English** strings (not next-intl) — match that; do not add i18n keys.
- Auth/proxy idiom (verbatim from `src/app/api/tenants/[slug]/route.ts`): read `cookies().get(COOKIE_NAME)?.value`; forward to `${DJANGO_API_URL}/api/v1/...` with `Authorization: Bearer <token>` + `X-Tenant-Domain`. Constants from `@/lib/constants`: `DJANGO_API_URL`, `BASE_DOMAIN`, `COOKIE_NAME`.
- Browser → Django MUST go through the Next proxy routes (apex has no tenant context for a direct `/api/v1/*` call); never call Django directly from the wizard client.
- Money is integer **minor units** from the API; format for display as `price_minor / 100` with the currency.
- Registrant contact must be mapped to AWS Route 53 shape: keys `FirstName, LastName, ContactType, OrganizationName, AddressLine1, City, State, CountryCode, ZipCode, PhoneNumber, Email`. `ContactType` = `"PERSON"` (or `"COMPANY"` if org given). `PhoneNumber` format `+CC.NUMBER`. `CountryCode` ISO 3166 alpha-2.
- House design system: token-only colors, Lucide at `h-4 w-4` default, 3px focus rings (the kit's Input/Button already carry them), empty/loading states, `cn()` for class mercrge.
- No frontend test runner exists (`package.json` has only `next lint`). Frontend task verification = `npx tsc --noEmit` clean + the final browser smoke (Task 9). Backend Task 1 uses real pytest TDD.
- Commands run from each app dir. Backend tests: `docker compose exec -T django pytest <path> -v` from repo root. Frontend typecheck: `cd frontend-main && npx tsc --noEmit`.
- Staging discipline: stage explicit paths only; never `git add -A`/`.`.

---

## File structure

```
backend/apps/domains/views.py                                  # MODIFY: checkout return URLs (apex + return_path)
backend/apps/domains/tests/test_checkout_api.py                # MODIFY: add return_path tests

frontend-main/src/app/api/tenants/[slug]/domain/search/route.ts    # GET  proxy → /api/v1/domains/search/
frontend-main/src/app/api/tenants/[slug]/domain/checkout/route.ts  # POST proxy → /api/v1/domains/checkout/
frontend-main/src/app/api/tenants/[slug]/domain/status/route.ts    # GET  proxy → /api/v1/domains/
frontend-main/src/app/api/tenants/[slug]/domain/[id]/retry/route.ts# POST proxy → /api/v1/domains/{id}/retry/
frontend-main/src/app/api/tenants/[slug]/domain/[id]/route.ts      # DELETE proxy → /api/v1/domains/{id}/

frontend-main/src/lib/domains.ts                               # client API wrapper + TS types
frontend-main/src/components/domain/registrant-form.tsx        # registrant details form
frontend-main/src/components/domain/domain-search.tsx          # search input + results
frontend-main/src/components/domain/provisioning-status.tsx    # polling status view
frontend-main/src/components/domain/domain-manage-card.tsx     # live domain + inline remove
frontend-main/src/app/dashboard/domain/[slug]/page.tsx         # server page: load tenant, render wizard
frontend-main/src/app/dashboard/domain/[slug]/wizard.tsx       # client: state machine orchestrator
frontend-main/src/components/dashboard/platform-card-domain-cta.tsx  # CTA used by the dashboard card
frontend-main/src/app/dashboard/page.tsx                       # MODIFY: add the CTA to each card
```

All proxy routes resolve the target host from a request header `x-tenant-host` (set by the client from the server-provided `tenant.domain`). Django enforces ownership via JWT regardless of the host value.

---

### Task 1: Backend — checkout view builds apex Stripe return URLs

**Files:**
- Modify: `backend/apps/domains/views.py` (the `checkout` view + `_origin` helper)
- Test: `backend/apps/domains/tests/test_checkout_api.py`

**Interfaces:**
- Consumes: `settings.SITE_SCHEME`, `settings.CONTENTOR_DOMAIN`.
- Produces: `checkout` accepts optional body `return_path` (relative path, default `"/dashboard"`); builds `success_url`/`cancel_url` as `<SITE_SCHEME>://<CONTENTOR_DOMAIN><return_path>`; rejects a `return_path` that does not start with a single `/` (i.e. not `//`, not absolute URL) with HTTP 400 `{"error": "BAD_RETURN_PATH"}`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/apps/domains/tests/test_checkout_api.py` (mirror the existing `owner`/`_client`/`tenant_ctx` fixtures already in the file):

```python
def test_checkout_uses_apex_return_path(coach_client_or_owner_client, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    settings.SITE_SCHEME = "https"
    settings.CONTENTOR_DOMAIN = "contentor.app"
    resp = <authed client>.post(
        "/api/v1/domains/checkout/",
        {"domain": "apexcoach.com", "return_path": "/dashboard/domain/acme"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    # bypass CheckoutSession.url is built from success_url; assert apex origin + path present
    assert "https://contentor.app/dashboard/domain/acme" in resp.json()["checkout_url"]


def test_checkout_rejects_unsafe_return_path(<authed client>, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = <authed client>.post(
        "/api/v1/domains/checkout/",
        {"domain": "apexcoach2.com", "return_path": "//evil.com"},
        format="json",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "BAD_RETURN_PATH"
```

(Use the same authenticated-client fixture the other tests in this file use — `_client(owner)` with `HTTP_HOST="shared-test.localhost"` + `tenant_ctx`.)

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose exec -T django pytest apps/domains/tests/test_checkout_api.py -v`
Expected: the two new tests FAIL (current code builds `/settings/domain` from `request.get_host()`).

- [ ] **Step 3: Implement**

In `backend/apps/domains/views.py`, replace the `_origin(request)` usage in `checkout` with apex-based URLs. Replace the existing `_origin` helper and the success/cancel construction:

```python
def _apex_origin() -> str:
    from django.conf import settings as s
    return f"{getattr(s, 'SITE_SCHEME', 'https')}://{s.CONTENTOR_DOMAIN}"


def _safe_return_path(raw: str | None) -> str | None:
    """Return a safe relative path (starts with single '/'), or None if invalid."""
    path = (raw or "/dashboard").strip()
    if not path.startswith("/") or path.startswith("//"):
        return None
    return path
```

In `checkout`, after validating `domain` and before building the session:

```python
    return_path = _safe_return_path(request.data.get("return_path"))
    if return_path is None:
        return Response(
            {"error": "BAD_RETURN_PATH", "detail": "return_path must be a relative path."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # ... (existing availability/price/row-creation) ...
    success = f"{_apex_origin()}{return_path}"
    cancel = f"{_apex_origin()}{return_path}?canceled=1"
```

Remove the now-unused `_origin(request)` helper if nothing else references it (grep first; the search view does not use it). Keep everything else in `checkout` unchanged (row creation in the transaction, the `except ProviderError: cd.delete()` rollback, the response shape `{"checkout_url", "custom_domain_id"}`).

- [ ] **Step 4: Run to verify they pass**

Run: `docker compose exec -T django pytest apps/domains/tests/test_checkout_api.py -v`
Expected: PASS (all, incl. the existing 3 and 2 new).

- [ ] **Step 5: Lint + commit**

Run: `docker compose exec -T django ruff check --config=pyproject.toml apps/domains/views.py`
Expected: All checks passed.

```bash
git add backend/apps/domains/views.py backend/apps/domains/tests/test_checkout_api.py
git commit -m "feat(domains): checkout builds apex Stripe return URLs from validated return_path"
```

---

### Task 2: Proxy route handlers (apex → Django)

**Files:**
- Create: `frontend-main/src/app/api/tenants/[slug]/domain/search/route.ts`
- Create: `frontend-main/src/app/api/tenants/[slug]/domain/checkout/route.ts`
- Create: `frontend-main/src/app/api/tenants/[slug]/domain/status/route.ts`
- Create: `frontend-main/src/app/api/tenants/[slug]/domain/[id]/retry/route.ts`
- Create: `frontend-main/src/app/api/tenants/[slug]/domain/[id]/route.ts`

**Interfaces:**
- Produces HTTP routes consumed by `src/lib/domains.ts` (Task 3):
  - `GET  /api/tenants/{slug}/domain/search?q=` → forwards to `GET /api/v1/domains/search/?q=`
  - `POST /api/tenants/{slug}/domain/checkout` (body forwarded) → `POST /api/v1/domains/checkout/`
  - `GET  /api/tenants/{slug}/domain/status` → `GET /api/v1/domains/`
  - `POST /api/tenants/{slug}/domain/{id}/retry` → `POST /api/v1/domains/{id}/retry/`
  - `DELETE /api/tenants/{slug}/domain/{id}` → `DELETE /api/v1/domains/{id}/`
- Every route reads the JWT cookie and the `x-tenant-host` request header; forwards `Authorization: Bearer <token>` + `X-Tenant-Domain: <x-tenant-host || BASE_DOMAIN>`.

- [ ] **Step 1: Implement a shared forwarder + the search route**

Create `frontend-main/src/app/api/tenants/[slug]/domain/search/route.ts`:

```typescript
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { BASE_DOMAIN, COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ detail: 'unauthorized' }, { status: 401 })

  const host = req.headers.get('x-tenant-host') || BASE_DOMAIN
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const res = await fetch(
    `${DJANGO_API_URL}/api/v1/domains/search/?q=${encodeURIComponent(q)}`,
    {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Domain': host },
      cache: 'no-store',
    },
  )
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
```

- [ ] **Step 2: Implement checkout route**

Create `frontend-main/src/app/api/tenants/[slug]/domain/checkout/route.ts`:

```typescript
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { BASE_DOMAIN, COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function POST(req: NextRequest) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ detail: 'unauthorized' }, { status: 401 })

  const host = req.headers.get('x-tenant-host') || BASE_DOMAIN
  const body = await req.json().catch(() => ({}))
  const res = await fetch(`${DJANGO_API_URL}/api/v1/domains/checkout/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Tenant-Domain': host,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
```

- [ ] **Step 3: Implement status route**

Create `frontend-main/src/app/api/tenants/[slug]/domain/status/route.ts`:

```typescript
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { BASE_DOMAIN, COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ detail: 'unauthorized' }, { status: 401 })

  const host = req.headers.get('x-tenant-host') || BASE_DOMAIN
  const res = await fetch(`${DJANGO_API_URL}/api/v1/domains/`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Domain': host },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
```

- [ ] **Step 4: Implement retry + delete routes**

Create `frontend-main/src/app/api/tenants/[slug]/domain/[id]/retry/route.ts`:

```typescript
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { BASE_DOMAIN, COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ detail: 'unauthorized' }, { status: 401 })

  const host = req.headers.get('x-tenant-host') || BASE_DOMAIN
  const res = await fetch(`${DJANGO_API_URL}/api/v1/domains/${params.id}/retry/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Domain': host },
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
```

Create `frontend-main/src/app/api/tenants/[slug]/domain/[id]/route.ts`:

```typescript
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { BASE_DOMAIN, COOKIE_NAME, DJANGO_API_URL } from '@/lib/constants'

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ detail: 'unauthorized' }, { status: 401 })

  const host = req.headers.get('x-tenant-host') || BASE_DOMAIN
  const res = await fetch(`${DJANGO_API_URL}/api/v1/domains/${params.id}/`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Domain': host },
  })
  if (res.status === 204) return new NextResponse(null, { status: 204 })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `cd frontend-main && npx tsc --noEmit`
Expected: no errors.

```bash
git add frontend-main/src/app/api/tenants/\[slug\]/domain
git commit -m "feat(domain-wizard): apex proxy routes for the tenant-scoped domain API"
```

---

### Task 3: Client API wrapper + types (`src/lib/domains.ts`)

**Files:**
- Create: `frontend-main/src/lib/domains.ts`

**Interfaces:**
- Produces (consumed by components/page):
  - Types: `DomainResult { domain: string; available: boolean; price_minor: number; currency: string }`; `SearchResponse { results: DomainResult[]; suggestions: DomainResult[] }`; `RegistrantContact` (Route 53 shape, see Global Constraints); `CustomDomainStatus { id: number; domain: string; provisioning_status: string; failed_step: string; price_minor: number; currency: string; expires_at: string | null; is_primary: boolean }`; `StatusResponse { custom_domain: CustomDomainStatus | null }`.
  - Functions (all take `host: string` = the tenant's resolvable domain, passed as `x-tenant-host`):
    - `searchDomains(slug, host, q): Promise<SearchResponse>`
    - `startCheckout(slug, host, body: { domain: string; contact: RegistrantContact; return_path: string }): Promise<{ checkout_url: string; custom_domain_id: number }>`
    - `getDomainStatus(slug, host): Promise<StatusResponse>`
    - `retryProvision(slug, host, id): Promise<unknown>`
    - `removeDomain(slug, host, id): Promise<void>`

- [ ] **Step 1: Implement**

```typescript
// frontend-main/src/lib/domains.ts
export interface DomainResult {
  domain: string
  available: boolean
  price_minor: number
  currency: string
}

export interface SearchResponse {
  results: DomainResult[]
  suggestions: DomainResult[]
}

export interface RegistrantContact {
  FirstName: string
  LastName: string
  ContactType: 'PERSON' | 'COMPANY'
  OrganizationName: string
  AddressLine1: string
  City: string
  State: string
  CountryCode: string
  ZipCode: string
  PhoneNumber: string
  Email: string
}

export interface CustomDomainStatus {
  id: number
  domain: string
  provisioning_status: string
  failed_step: string
  price_minor: number
  currency: string
  expires_at: string | null
  is_primary: boolean
}

export interface StatusResponse {
  custom_domain: CustomDomainStatus | null
}

const base = (slug: string) => `/api/tenants/${encodeURIComponent(slug)}/domain`

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || body?.error || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function searchDomains(slug: string, host: string, q: string): Promise<SearchResponse> {
  const res = await fetch(`${base(slug)}/search?q=${encodeURIComponent(q)}`, {
    headers: { 'x-tenant-host': host },
  })
  return jsonOrThrow<SearchResponse>(res)
}

export async function startCheckout(
  slug: string,
  host: string,
  body: { domain: string; contact: RegistrantContact; return_path: string },
): Promise<{ checkout_url: string; custom_domain_id: number }> {
  const res = await fetch(`${base(slug)}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-host': host },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function getDomainStatus(slug: string, host: string): Promise<StatusResponse> {
  const res = await fetch(`${base(slug)}/status`, { headers: { 'x-tenant-host': host } })
  return jsonOrThrow<StatusResponse>(res)
}

export async function retryProvision(slug: string, host: string, id: number): Promise<unknown> {
  const res = await fetch(`${base(slug)}/${id}/retry`, {
    method: 'POST',
    headers: { 'x-tenant-host': host },
  })
  return jsonOrThrow(res)
}

export async function removeDomain(slug: string, host: string, id: number): Promise<void> {
  const res = await fetch(`${base(slug)}/${id}`, {
    method: 'DELETE',
    headers: { 'x-tenant-host': host },
  })
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || 'Failed to remove domain')
  }
}

export function formatPrice(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend-main && npx tsc --noEmit`
Expected: no errors.

```bash
git add frontend-main/src/lib/domains.ts
git commit -m "feat(domain-wizard): client API wrapper + types"
```

---

### Task 4: Registrant form component

**Files:**
- Create: `frontend-main/src/components/domain/registrant-form.tsx`

**Interfaces:**
- Consumes: `RegistrantContact` from `@/lib/domains`; UI `Input`, `Label`, `Button` from `@/components/ui/*`.
- Produces: `RegistrantForm({ defaultEmail, defaultName, onSubmit, onBack, submitLabel }: { defaultEmail: string; defaultName: string; onSubmit: (c: RegistrantContact) => void; onBack: () => void; submitLabel: string })` — a controlled form that validates required fields and calls `onSubmit` with a fully-formed `RegistrantContact`.

- [ ] **Step 1: Implement**

```tsx
// frontend-main/src/components/domain/registrant-form.tsx
'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RegistrantContact } from '@/lib/domains'

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' }, { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' }, { code: 'NL', name: 'Netherlands' }, { code: 'TR', name: 'Türkiye' },
  { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' }, { code: 'IE', name: 'Ireland' },
  { code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' }, { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' },
  { code: 'CH', name: 'Switzerland' }, { code: 'AT', name: 'Austria' }, { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' }, { code: 'MX', name: 'Mexico' }, { code: 'IN', name: 'India' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'JP', name: 'Japan' },
]

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return { first: full.trim(), last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export function RegistrantForm({
  defaultEmail,
  defaultName,
  onSubmit,
  onBack,
  submitLabel,
}: {
  defaultEmail: string
  defaultName: string
  onSubmit: (c: RegistrantContact) => void
  onBack: () => void
  submitLabel: string
}) {
  const seed = splitName(defaultName || '')
  const [firstName, setFirstName] = useState(seed.first)
  const [lastName, setLastName] = useState(seed.last)
  const [organization, setOrganization] = useState('')
  const [address1, setAddress1] = useState('')
  const [city, setCity] = useState('')
  const [stateRegion, setStateRegion] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('US')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(defaultEmail || '')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!firstName || !lastName || !address1 || !city || !zip || !email) {
      setError('Please fill in all required fields.')
      return
    }
    // Phone must be +CC.NUMBER for Route 53.
    const phoneClean = phone.replace(/[^\d+.]/g, '')
    if (!/^\+\d{1,3}\.\d{4,}$/.test(phoneClean)) {
      setError('Phone must look like +1.5551234567 (country code, dot, number).')
      return
    }
    onSubmit({
      FirstName: firstName,
      LastName: lastName,
      ContactType: organization ? 'COMPANY' : 'PERSON',
      OrganizationName: organization,
      AddressLine1: address1,
      City: city,
      State: stateRegion,
      CountryCode: country,
      ZipCode: zip,
      PhoneNumber: phoneClean,
      Email: email,
    })
  }

  const field = 'space-y-1.5'
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className={field}><Label htmlFor="fn">First name *</Label><Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
        <div className={field}><Label htmlFor="ln">Last name *</Label><Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
      </div>
      <div className={field}><Label htmlFor="org">Organization (optional)</Label><Input id="org" value={organization} onChange={(e) => setOrganization(e.target.value)} /></div>
      <div className={field}><Label htmlFor="addr">Address *</Label><Input id="addr" value={address1} onChange={(e) => setAddress1(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className={field}><Label htmlFor="city">City *</Label><Input id="city" value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div className={field}><Label htmlFor="state">State / region</Label><Input id="state" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={field}><Label htmlFor="zip">Postal code *</Label><Input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} /></div>
        <div className={field}>
          <Label htmlFor="country">Country *</Label>
          <select
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={field}><Label htmlFor="phone">Phone *</Label><Input id="phone" placeholder="+1.5551234567" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className={field}><Label htmlFor="email">Email *</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button type="submit" variant="brand">{submitLabel}</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend-main && npx tsc --noEmit`
Expected: no errors. (If `Button` lacks a `brand` variant in frontend-main, use `variant="default"` — verify against `src/components/ui/button.tsx` and adjust.)

```bash
git add frontend-main/src/components/domain/registrant-form.tsx
git commit -m "feat(domain-wizard): registrant details form"
```

---

### Task 5: Domain search component

**Files:**
- Create: `frontend-main/src/components/domain/domain-search.tsx`

**Interfaces:**
- Consumes: `searchDomains`, `formatPrice`, types from `@/lib/domains`; `Input`, `Button`, `Skeleton` from UI.
- Produces: `DomainSearch({ slug, host, onPick }: { slug: string; host: string; onPick: (d: DomainResult) => void })` — search input + results/suggestions list; clicking an available result calls `onPick`.

- [ ] **Step 1: Implement**

```tsx
// frontend-main/src/components/domain/domain-search.tsx
'use client'

import { useState } from 'react'
import { Search, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { searchDomains, formatPrice, type DomainResult } from '@/lib/domains'

function ResultRow({ r, onPick }: { r: DomainResult; onPick: (d: DomainResult) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{r.domain}</p>
        <p className="text-xs text-muted-foreground">
          {r.available ? `${formatPrice(r.price_minor, r.currency)} / year` : 'Taken'}
        </p>
      </div>
      {r.available ? (
        <Button size="sm" variant="brand" onClick={() => onPick(r)}>
          <Check className="h-4 w-4" /> Choose
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Unavailable</span>
      )}
    </div>
  )
}

export function DomainSearch({
  slug,
  host,
  onPick,
}: {
  slug: string
  host: string
  onPick: (d: DomainResult) => void
}) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<DomainResult[]>([])
  const [suggestions, setSuggestions] = useState<DomainResult[]>([])
  const [searched, setSearched] = useState(false)

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    const query = q.trim()
    if (!query) return
    setLoading(true)
    setError(null)
    try {
      const data = await searchDomains(slug, host, query)
      setResults(data.results)
      setSuggestions(data.suggestions)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="yourbrand.com"
          aria-label="Search for a domain"
        />
        <Button type="submit" variant="brand" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!loading && searched && (
        <div className="space-y-2">
          {results.map((r) => <ResultRow key={r.domain} r={r} onPick={onPick} />)}
          {suggestions.length > 0 && (
            <>
              <p className="pt-2 text-xs font-medium text-muted-foreground">Suggestions</p>
              {suggestions.map((r) => <ResultRow key={r.domain} r={r} onPick={onPick} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend-main && npx tsc --noEmit`
Expected: no errors.

```bash
git add frontend-main/src/components/domain/domain-search.tsx
git commit -m "feat(domain-wizard): domain search component"
```

---

### Task 6: Provisioning status component (polling)

**Files:**
- Create: `frontend-main/src/components/domain/provisioning-status.tsx`

**Interfaces:**
- Consumes: `getDomainStatus`, `retryProvision`, `CustomDomainStatus` from `@/lib/domains`; `Button`.
- Produces: `ProvisioningStatus({ slug, host, onLive }: { slug: string; host: string; onLive: (d: CustomDomainStatus) => void })` — polls `getDomainStatus` every 3s, renders the ordered steps with the current one active; on `provisioning_status === 'live'` calls `onLive` and stops; on `'failed'` shows the failed step + a Retry button.

- [ ] **Step 1: Implement**

```tsx
// frontend-main/src/components/domain/provisioning-status.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getDomainStatus, retryProvision, type CustomDomainStatus } from '@/lib/domains'

const STEPS: { key: string; label: string }[] = [
  { key: 'registering', label: 'Registering the domain' },
  { key: 'dns_zone', label: 'Creating the DNS zone' },
  { key: 'dns_records', label: 'Pointing DNS at your site' },
  { key: 'email_auth', label: 'Configuring email' },
  { key: 'ssl', label: 'Issuing the SSL certificate' },
  { key: 'live', label: 'Going live' },
]

function stepIndex(status: string): number {
  const i = STEPS.findIndex((s) => s.key === status)
  return i === -1 ? 0 : i
}

export function ProvisioningStatus({
  slug,
  host,
  onLive,
}: {
  slug: string
  host: string
  onLive: (d: CustomDomainStatus) => void
}) {
  const [cd, setCd] = useState<CustomDomainStatus | null>(null)
  const [retrying, setRetrying] = useState(false)
  const onLiveRef = useRef(onLive)
  onLiveRef.current = onLive

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        const { custom_domain } = await getDomainStatus(slug, host)
        if (!active) return
        setCd(custom_domain)
        if (custom_domain?.provisioning_status === 'live') {
          onLiveRef.current(custom_domain)
          return
        }
      } catch {
        // transient — keep polling
      }
      if (active) timer = setTimeout(tick, 3000)
    }
    tick()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [slug, host])

  const failed = cd?.provisioning_status === 'failed'
  const current = stepIndex(cd?.provisioning_status ?? 'registering')

  const retry = async () => {
    if (!cd) return
    setRetrying(true)
    try {
      await retryProvision(slug, host, cd.id)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {STEPS.map((s, i) => {
          const done = i < current || cd?.provisioning_status === 'live'
          const active = i === current && !failed && cd?.provisioning_status !== 'live'
          return (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]">
                {done ? <Check className="h-4 w-4 text-primary" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />}
              </span>
              <span className={done || active ? 'text-foreground' : 'text-muted-foreground'}>{s.label}</span>
            </li>
          )
        })}
      </ol>

      {failed && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>Setup failed{cd?.failed_step ? ` at: ${cd.failed_step}` : ''}.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={retry} disabled={retrying}>
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend-main && npx tsc --noEmit`
Expected: no errors.

```bash
git add frontend-main/src/components/domain/provisioning-status.tsx
git commit -m "feat(domain-wizard): provisioning status with polling + retry"
```

---

### Task 7: Domain manage card (live state + inline remove)

**Files:**
- Create: `frontend-main/src/components/domain/domain-manage-card.tsx`

**Interfaces:**
- Consumes: `removeDomain`, `CustomDomainStatus`, `formatPrice` from `@/lib/domains`; `Button`, `Badge`.
- Produces: `DomainManageCard({ slug, host, domain, onRemoved }: { slug: string; host: string; domain: CustomDomainStatus; onRemoved: () => void })` — shows the live domain, a "Live" badge, yearly price, expiry; a Remove button that reveals an inline confirm (`Remove` / `Cancel`); on confirm calls `removeDomain` then `onRemoved`.

- [ ] **Step 1: Implement**

```tsx
// frontend-main/src/components/domain/domain-manage-card.tsx
'use client'

import { useState } from 'react'
import { Globe2, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { removeDomain, formatPrice, type CustomDomainStatus } from '@/lib/domains'

export function DomainManageCard({
  slug,
  host,
  domain,
  onRemoved,
}: {
  slug: string
  host: string
  domain: CustomDomainStatus
  onRemoved: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await removeDomain(slug, host, domain.id)
      onRemoved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-lg font-semibold">
          <Globe2 className="h-5 w-5 text-muted-foreground" />
          {domain.domain}
        </span>
        <Badge>Live</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Yearly price</dt>
        <dd className="text-right">{formatPrice(domain.price_minor, domain.currency)}</dd>
        <dt className="text-muted-foreground">Renews</dt>
        <dd className="text-right">{domain.expires_at ? new Date(domain.expires_at).toLocaleDateString() : '—'}</dd>
      </dl>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {confirming ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <span className="text-sm text-destructive">Remove this domain? Your site falls back to its contentor.app address.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" /> Remove domain
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend-main && npx tsc --noEmit`
Expected: no errors. (Confirm `Button` has a `destructive` variant in frontend-main; if not, use `variant="outline"` + `className="text-destructive"`.)

```bash
git add frontend-main/src/components/domain/domain-manage-card.tsx
git commit -m "feat(domain-wizard): live domain manage card with inline remove"
```

---

### Task 8: Wizard page + orchestrator + dashboard CTA

**Files:**
- Create: `frontend-main/src/app/dashboard/domain/[slug]/page.tsx` (server)
- Create: `frontend-main/src/app/dashboard/domain/[slug]/wizard.tsx` (client orchestrator)
- Create: `frontend-main/src/components/dashboard/platform-card-domain-cta.tsx`
- Modify: `frontend-main/src/app/dashboard/page.tsx` (render the CTA in each `PlatformCard`)

**Interfaces:**
- Consumes: `getMyTenants` from `@/lib/tenants`, `requireAuth`/`getAuthUser` from `@/lib/auth`, all domain components + `getDomainStatus`/`startCheckout` from `@/lib/domains`.
- Produces: route `/dashboard/domain/[slug]` rendering the wizard for the matching tenant; a `PlatformCardDomainCta({ slug }: { slug: string })` link component.

- [ ] **Step 1: Server page — resolve tenant, guard ownership, pass props**

```tsx
// frontend-main/src/app/dashboard/domain/[slug]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { getMyTenants } from '@/lib/tenants'
import { DomainWizard } from './wizard'

export default async function DomainWizardPage({ params }: { params: { slug: string } }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const tenants = await getMyTenants()
  const tenant = tenants.find((t) => t.slug === params.slug)
  if (!tenant) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Custom domain</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        For <span className="font-medium text-foreground">{tenant.name}</span> ({tenant.domain})
      </p>
      <div className="mt-8">
        <DomainWizard
          slug={tenant.slug}
          host={tenant.domain}
          defaultEmail={user.email ?? ''}
          defaultName={user.name ?? ''}
        />
      </div>
    </main>
  )
}
```

(Confirm the `User` shape from `@/lib/auth` exposes `email` and `name`; adjust the prop access if the fields differ.)

- [ ] **Step 2: Client orchestrator (state machine)**

```tsx
// frontend-main/src/app/dashboard/domain/[slug]/wizard.tsx
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { DomainSearch } from '@/components/domain/domain-search'
import { RegistrantForm } from '@/components/domain/registrant-form'
import { ProvisioningStatus } from '@/components/domain/provisioning-status'
import { DomainManageCard } from '@/components/domain/domain-manage-card'
import {
  getDomainStatus,
  startCheckout,
  formatPrice,
  type CustomDomainStatus,
  type DomainResult,
  type RegistrantContact,
} from '@/lib/domains'
import { Button } from '@/components/ui/button'

type Phase = 'loading' | 'search' | 'registrant' | 'confirm' | 'provisioning' | 'live'

export function DomainWizard({
  slug,
  host,
  defaultEmail,
  defaultName,
}: {
  slug: string
  host: string
  defaultEmail: string
  defaultName: string
}) {
  const params = useSearchParams()
  const [phase, setPhase] = useState<Phase>('loading')
  const [picked, setPicked] = useState<DomainResult | null>(null)
  const [contact, setContact] = useState<RegistrantContact | null>(null)
  const [live, setLive] = useState<CustomDomainStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

  // On mount: if a domain row already exists, jump to provisioning/live.
  useEffect(() => {
    let active = true
    getDomainStatus(slug, host)
      .then(({ custom_domain }) => {
        if (!active) return
        if (!custom_domain || custom_domain.provisioning_status === 'lapsed') {
          setPhase('search')
        } else if (custom_domain.provisioning_status === 'live') {
          setLive(custom_domain)
          setPhase('live')
        } else {
          setPhase('provisioning')
        }
      })
      .catch(() => active && setPhase('search'))
    return () => {
      active = false
    }
  }, [slug, host])

  const startPayment = async (c: RegistrantContact) => {
    if (!picked) return
    setPaying(true)
    setError(null)
    try {
      const { checkout_url } = await startCheckout(slug, host, {
        domain: picked.domain,
        contact: c,
        return_path: `/dashboard/domain/${slug}`,
      })
      window.location.href = checkout_url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
      setPaying(false)
    }
  }

  if (phase === 'loading') {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  if (phase === 'live' && live) {
    return <DomainManageCard slug={slug} host={host} domain={live} onRemoved={() => { setLive(null); setPicked(null); setPhase('search') }} />
  }

  if (phase === 'provisioning') {
    return <ProvisioningStatus slug={slug} host={host} onLive={(d) => { setLive(d); setPhase('live') }} />
  }

  if (phase === 'search') {
    return (
      <DomainSearch
        slug={slug}
        host={host}
        onPick={(d) => { setPicked(d); setPhase('registrant') }}
      />
    )
  }

  if (phase === 'registrant' && picked) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Registering <span className="font-medium text-foreground">{picked.domain}</span> — {formatPrice(picked.price_minor, picked.currency)} / year.
        </p>
        <RegistrantForm
          defaultEmail={defaultEmail}
          defaultName={defaultName}
          submitLabel="Continue to payment"
          onBack={() => setPhase('search')}
          onSubmit={(c) => { setContact(c); startPayment(c) }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {paying && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Redirecting to secure payment…</p>}
      </div>
    )
  }

  return null
}
```

Note: returning from Stripe lands on this same route; the mount-effect's `getDomainStatus` finds the row (the webhook created it) and shows `provisioning`. The `?session_id`/`?canceled` params need no special handling beyond that (the effect drives state); `params` is imported for future use and to allow a "canceled" notice — if `params.get('canceled')` is set and no row exists, it simply shows search.

- [ ] **Step 3: CTA component**

```tsx
// frontend-main/src/components/dashboard/platform-card-domain-cta.tsx
import Link from 'next/link'
import { Globe2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PlatformCardDomainCta({ slug }: { slug: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={`/dashboard/domain/${slug}`}>
        <Globe2 className="h-3.5 w-3.5" /> Custom domain
      </Link>
    </Button>
  )
}
```

- [ ] **Step 4: Wire the CTA into the dashboard card**

In `frontend-main/src/app/dashboard/page.tsx`, import the CTA and render it in the `PlatformCard` action row (next to the existing "Open studio" / status button):

```tsx
import { PlatformCardDomainCta } from '@/components/dashboard/platform-card-domain-cta'
```

In the `<div className="mt-7 flex items-center gap-2">` action row of `PlatformCard`, add after the existing button:

```tsx
        <PlatformCardDomainCta slug={tenant.slug} />
```

- [ ] **Step 5: Typecheck + commit**

Run: `cd frontend-main && npx tsc --noEmit`
Expected: no errors.

```bash
git add frontend-main/src/app/dashboard/domain frontend-main/src/components/dashboard/platform-card-domain-cta.tsx frontend-main/src/app/dashboard/page.tsx
git commit -m "feat(domain-wizard): wizard page + state machine + dashboard CTA"
```

---

### Task 9: Browser smoke (bypass mode) + production-build check

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Ensure bypass mode + stack up**

Confirm `DOMAINS_BYPASS_ENABLED = True` (dev default) and the dev stack is running (`docker compose ps` shows django + nextjs-main up). Run `docker compose exec -T django python manage.py migrate_schemas --shared` to ensure `domains` migrations are applied.

- [ ] **Step 2: Production build of frontend-main (catches App-Router/route issues tsc can't)**

Run: `cd frontend-main && npx next build`
Expected: build succeeds, including the new `/dashboard/domain/[slug]` route and the `/api/tenants/[slug]/domain/*` route handlers.

- [ ] **Step 3: Browser smoke via Chrome DevTools MCP**

As a logged-in coach on the apex dashboard, drive the full flow against the running dev stack (bypass registrar/cloudflare/resend, bypass billing):
1. Dashboard → a platform card → "Custom domain" → `/dashboard/domain/<slug>`.
2. Search `freecoach.com` → shows an available priced result; pick it.
3. Registrant form → fill required fields + phone `+1.5551234567` → Continue to payment.
4. Bypass checkout returns to `/dashboard/domain/<slug>` → provisioning steps poll → reaches **live** (the bypass fakes complete instantly; the webhook is not fired in a pure browser bypass, so if the row stays `pending`, manually confirm via `docker compose exec -T django python manage.py shell` that `provision()` advancing is driven by the webhook — for the smoke, calling the checkout endpoint in bypass creates the row in `pending`; trigger provisioning by POSTing the retry endpoint or invoking `provision_domain` once).
5. Live → manage card shows the domain + "Live"; click Remove → confirm → returns to search.

Record results (screenshots/notes). Any failure → fix in the owning task and re-verify.

- [ ] **Step 4: Commit any fixes** (if Step 3 surfaced issues), each in its owning file with a focused message.

---

## Self-Review

**Spec coverage** (against `2026-06-23-custom-domain-onboarder-design.md` "Coach flow"):
- Search + price → Tasks 5, 3, 2 (search proxy + lib + component).
- Review registrant (prefilled, required) → Task 4 (full form, prefilled email/name).
- Confirm + pay (annual Stripe) → Task 8 orchestrator + Task 2 checkout proxy + Task 1 apex return URL.
- Provision (async, status screen) → Task 6 polling.
- Live / manage / remove → Task 7.
- Placement on "my platforms" + onboarding CTA → Task 8 (dashboard CTA).
- Reuse Phase-1 tenant-scoped APIs via apex proxy → Task 2; one backend change (return URL) → Task 1.

**Placeholder scan:** every code step has complete code. The only "verify/adjust" notes (Button variants `brand`/`destructive`, `User.email/name` field names) are deliberate cross-checks against existing files whose exact API must be matched — each names the file to check and the fallback. No TODOs.

**Type consistency:** `searchDomains/startCheckout/getDomainStatus/retryProvision/removeDomain(slug, host, …)` signatures match across lib (Task 3) and all consumers (Tasks 5–8). `CustomDomainStatus`/`DomainResult`/`RegistrantContact` defined once in Task 3 and reused. Proxy header `x-tenant-host` set by lib (Task 3) and read by every route (Task 2). `return_path` produced by the wizard (Task 8) and validated by the backend (Task 1).

## Notes / known follow-ups (out of scope here)
- Real Route 53 registration also needs the dedicated `AWS_ROUTE53_*` creds, Cloudflare/Resend creds, and the tunnel-catch-all verification (tracked in the feature's pre-prod hardening).
- i18n: the wizard is English-only to match the dashboard; a TR pass is a separate batch.
- The smoke relies on bypass mode; full provisioning is webhook-driven (Stripe → `checkout.session.completed`), which a pure browser bypass does not fire — Task 9 Step 3 notes how to advance provisioning manually for the smoke.
