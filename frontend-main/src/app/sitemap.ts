import type { MetadataRoute } from "next";

import { fetchPlatformPosts } from "@/lib/platform-blog";
import { BASE_URL, alternates } from "@/lib/seo";
import { enabledLocales } from "@shared/i18n/locales";

export const dynamic = "force-dynamic";

/** One entry per language of a page, each naming all the others. */
function page(
  path: string,
  changeFrequency: "weekly" | "daily",
  priority: number,
): MetadataRoute.Sitemap {
  const { languages } = alternates(path, "en");
  const absolute = Object.fromEntries(
    Object.entries(languages).map(([l, p]) => [l, `${BASE_URL}${p}`]),
  );
  return enabledLocales().map((l) => ({
    url: absolute[l],
    changeFrequency,
    priority,
    alternates: { languages: absolute },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await fetchPlatformPosts();
  return [
    ...page("/", "weekly", 1),
    ...page("/pricing", "weekly", 0.8),
    ...page("/blog", "daily", 0.8),
    // Posts are English only, so they have one address (see their canonical).
    ...posts.map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: post.published_at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
