// Server-side fetch helpers for the contentor.app marketing blog
// (backend apps.blog.platform_views — public schema, no tenant header).
import { DJANGO_API_URL } from "@/lib/constants";

export interface PlatformBlogPost {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  meta_description?: string;
  body_html?: string;
  published_at: string;
}

export async function fetchPlatformPosts(): Promise<PlatformBlogPost[]> {
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/platform/blog/posts/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function fetchPlatformPost(
  slug: string,
): Promise<PlatformBlogPost | null> {
  try {
    const res = await fetch(
      `${DJANGO_API_URL}/api/v1/platform/blog/posts/${encodeURIComponent(slug)}/`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
