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
