import type { MetadataRoute } from "next";

import { PRIVATE_PATHS, fetchPublicSite } from "@/lib/site-index";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await fetchPublicSite();
  // No such tenant, or a site still behind its preview gate.
  if (!site) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${site.origin}/sitemap.xml`,
  };
}
