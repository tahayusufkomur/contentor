import type { MetadataRoute } from "next";

import { getThemePalette } from "@/lib/themes";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const slug = await getTenantSlug();
  const config = slug !== "__platform__" ? await fetchTenantConfig(slug) : null;
  const theme = getThemePalette(config?.theme);
  const name = config?.brand_name ?? "Contentor";
  const v = config?.logo_id ?? "default";

  return {
    id: "/",
    name,
    short_name: name,
    description: config?.meta_description ?? "Content creator platform",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "en",
    categories: ["education"],
    background_color: "#ffffff",
    theme_color: theme.primaryHex,
    icons: [
      { src: `/pwa-icon?size=192&v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa-icon?size=512&v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: `/pwa-icon?size=512&purpose=maskable&v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
