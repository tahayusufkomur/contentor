import { headers } from "next/headers";
import { BASE_DOMAIN, DJANGO_API_URL } from "@/lib/constants";
import type { PlansResponse } from "@/lib/plans";

/** Live plans from Django, or null when it did not answer. Pricing and the
 * landing teaser share this one fetch. */
export async function fetchPlans(): Promise<PlansResponse | null> {
  const country = headers().get("cf-ipcountry");
  try {
    const res = await fetch(
      `${DJANGO_API_URL}/api/v1/billing/platform/plans/`,
      {
        headers: {
          "X-Tenant-Domain": BASE_DOMAIN,
          // Server-side fetch loses the visitor: forward Cloudflare's country
          // so the API picks EUR vs USD for them.
          ...(country ? { "CF-IPCountry": country } : {}),
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
