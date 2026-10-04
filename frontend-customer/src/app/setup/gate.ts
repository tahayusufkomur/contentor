import { BASE_DOMAIN } from "@/lib/constants";
import { configCache, fetchTenantConfig, getTenantDomain } from "@/lib/tenant";

/** True while the tenant's guided setup is still running (coach routes then
 * redirect to /setup). A cached "active" is re-checked fresh: the flow ends
 * in Django, and the 60s prod config cache would otherwise bounce a coach
 * who just finished from /admin straight back to /setup. */
export async function setupFlowActive(slug: string): Promise<boolean> {
  const config = await fetchTenantConfig(slug);
  if (!config?.setup_flow_active) return false;
  const domain = (await getTenantDomain()).split(":")[0];
  configCache.delete(domain || `${slug}.${BASE_DOMAIN}`);
  return Boolean((await fetchTenantConfig(slug))?.setup_flow_active);
}
