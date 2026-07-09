import type { MetadataRoute } from "next";

import { fetchPlatformPosts } from "@/lib/platform-blog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://contentor.app";
  const posts = await fetchPlatformPosts();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.8 },
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.published_at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
