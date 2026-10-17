import type { MetadataRoute } from "next";

import { fetchSiteIndex, sitemapEntries } from "@/lib/site-index";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await fetchSiteIndex();
  return site ? sitemapEntries(site) : [];
}
