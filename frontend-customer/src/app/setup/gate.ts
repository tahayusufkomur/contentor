import { BASE_DOMAIN } from "@/lib/constants";
import { configCache, fetchTenantConfig, getTenantDomain } from "@/lib/tenant";

/** A config flag that holds the coach on one screen, read fresh when the
 * cache says it is on: it ends in Django, and the 60s prod config cache would
 * otherwise keep a coach who just moved on stuck there. */
async function heldFlag(
  slug: string,
  flag: "setup_flow_active" | "paused",
): Promise<boolean> {
  const config = await fetchTenantConfig(slug);
  if (!config?.[flag]) return false;
  const domain = (await getTenantDomain()).split(":")[0];
  configCache.delete(domain || `${slug}.${BASE_DOMAIN}`);
  return Boolean((await fetchTenantConfig(slug))?.[flag]);
}

/** True while the tenant's guided setup is still running (coach routes then
 * redirect to /setup). */
export const setupFlowActive = (slug: string) =>
  heldFlag(slug, "setup_flow_active");

/** True while the site is paused (a plan needed, none running): every admin
 * page is then the plan picker. */
export const sitePaused = (slug: string) => heldFlag(slug, "paused");
