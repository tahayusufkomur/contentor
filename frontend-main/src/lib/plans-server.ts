import { cache } from "react";
import { headers } from "next/headers";
import { BASE_DOMAIN, DJANGO_API_URL } from "@/lib/constants";
import type { PlansResponse } from "@/lib/plans";

/** Live plans from Django, or null when it did not answer. Pricing, the
 * landing teaser and the earnings calculator share this one fetch (cached per
 * request, so the landing asks once). */
export const fetchPlans = cache(async (): Promise<PlansResponse | null> => {
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
        // The landing streams around this; a slow Django costs 2 s at most.
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!res.ok) return null;
    return await res.json(); // await: a bad body lands in the catch
  } catch {
    return null;
  }
});
