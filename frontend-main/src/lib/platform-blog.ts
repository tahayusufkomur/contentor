// Server-side fetch helpers for the contentor.app marketing blog
// (backend apps.blog.platform_views — public schema, no tenant header).
import { DJANGO_API_URL } from "@/lib/constants";
import { localizedHref } from "@/lib/locale-href";
import { resolveLocale } from "@shared/i18n/locales";

export interface PlatformBlogPost {
  slug: string;
  title: string;
  /** The language the post is written in; absent means English. */
  language?: string;
  excerpt: string;
  tags: string[];
  meta_description?: string;
  body_html?: string;
  published_at: string;
  /** Not sent by the platform blog API today (PlatformBlogPost has no cover
   * field); read when it appears so covers light up without a frontend change. */
  cover_photo_url?: string | null;
}

const POSTS_URL = `${DJANGO_API_URL}/api/v1/platform/blog/posts/`;

/** The published posts, newest first; with a language, only that language's. */
export async function fetchPlatformPosts(
  language?: string,
): Promise<PlatformBlogPost[]> {
  try {
    const query = language ? `?language=${encodeURIComponent(language)}` : "";
    const res = await fetch(`${POSTS_URL}${query}`, {
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

/** Whether a language has any post: the header shows its Blog link only then.
 *  Unsure (an error) counts as yes: a link to an empty blog beats a lost one. */
export async function platformBlogHasPosts(language: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${POSTS_URL}?language=${encodeURIComponent(language)}&page_size=1`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return true;
    return ((await res.json()).count ?? 0) > 0;
  } catch {
    return true;
  }
}

/** The language a post's page is in: its own, English when that is not enabled. */
export const postLanguage = (post: Pick<PlatformBlogPost, "language">) =>
  resolveLocale(post.language);

/** Where a post lives: the same address as its language's blog index. */
export const postPath = (post: Pick<PlatformBlogPost, "slug" | "language">) =>
  localizedHref(`/blog/${post.slug}`, postLanguage(post));
