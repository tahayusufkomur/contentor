import { headers } from "next/headers";

import { BASE_DOMAIN, DJANGO_API_URL } from "@/lib/constants";
import type { TenantConfig } from "@/types/tenant";

export async function getTenantSlug(): Promise<string> {
  const headersList = await headers();
  return headersList.get("x-tenant-slug") || "unknown";
}

export async function getTenantDomain(): Promise<string> {
  const headersList = await headers();
  return headersList.get("x-tenant-domain") || "";
}

export const configCache = new Map<
  string,
  { config: TenantConfig; timestamp: number }
>();
// In dev the cache is disabled: e2e specs (and hot manual edits) PATCH config
// through Django and immediately assert the public page reflects it — a warm
// cache turns that into a 60s stale window whose outcome depends on leftover
// tenant state. Prod keeps the TTL; a coach's edit taking up to a minute to
// reach the public site is an accepted tradeoff there.
const CACHE_TTL = process.env.NODE_ENV === "development" ? 0 : 60_000;

export async function fetchTenantConfig(
  slug: string,
): Promise<TenantConfig | null> {
  if (!slug || slug === "unknown") return null;

  // Prefer the live request host so TR tenants (<slug>.tr.<BASE_DOMAIN>) and
  // custom domains resolve to the right Domain row. Fall back to a slug-built
  // global hostname only when headers are unavailable (generateMetadata,
  // manifest.ts), where the slug+BASE_DOMAIN guess is the best we can do.
  const liveDomain = (await getTenantDomain()).split(":")[0];
  const domain = liveDomain || `${slug}.${BASE_DOMAIN}`;

  const cached = configCache.get(domain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config;
  }

  // Distinguish "tenant genuinely does not exist" (Django 404 → null, the caller may
  // 404 the page) from a transient failure (network error / 5xx). A transient blip must
  // NOT be reported as "no tenant" — that wrongly shows "Site not found" on a valid
  // tenant on cold loads — so retry briefly before giving up. The config endpoint is
  // exempt from tenant rate limiting server-side, so this retry never amplifies a 429.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${DJANGO_API_URL}/api/v1/admin/config/`, {
        headers: { "X-Tenant-Domain": domain },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404) return null; // definitive: no such tenant
      if (res.ok) {
        const config: TenantConfig = await res.json();
        configCache.set(domain, { config, timestamp: Date.now() });
        return config;
      }
      // 5xx and other non-ok statuses are transient — fall through to retry
    } catch {
      // network error / timeout — fall through to retry
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}
