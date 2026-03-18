import type { MetadataRoute } from "next";
import { getThemePalette } from "@/lib/themes";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const slug = await getTenantSlug();
  const config = slug !== "__platform__" ? await fetchTenantConfig(slug) : null;
  const theme = getThemePalette(config?.theme);

  return {
    name: config?.brand_name ?? "Contentor",
    short_name: config?.brand_name ?? "Contentor",
    description: config?.meta_description ?? "Content creator platform",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: theme.primaryHex,
    icons: [
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
