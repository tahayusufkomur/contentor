import type { MetadataRoute } from "next";

import { fetchPlatformPosts, postPath } from "@/lib/platform-blog";
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
  // Each language's posts; a language that is not enabled has none listed.
  const posts = (
    await Promise.all(enabledLocales().map((l) => fetchPlatformPosts(l)))
  ).flat();
  return [
    ...page("/", "weekly", 1),
    ...page("/pricing", "weekly", 0.8),
    ...page("/blog", "daily", 0.8),
    // A post has one address, in its own language (see its canonical).
    ...posts.map((post) => ({
      url: `${BASE_URL}${postPath(post)}`,
      lastModified: post.published_at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
