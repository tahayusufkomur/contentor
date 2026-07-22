/**
 * Client-side helper for the coach plan-entitlements API.
 *
 * Powers the admin "Paid feature" badges. Pure types + the locked-decision
 * live in `lib/entitlements.ts`; this module only adds the fetch.
 */

import { clientFetch } from "@/lib/api-client";
import type { Entitlements } from "@/lib/entitlements";

export type { Entitlements, EntitlementKey } from "@/lib/entitlements";

export async function getEntitlements(): Promise<Entitlements> {
  return clientFetch<Entitlements>("/api/v1/billing/platform/entitlements/");
}
