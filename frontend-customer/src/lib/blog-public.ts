import { serverFetch } from "@/lib/api-server";
// Server-side fetch helpers for the public coach-site blog. Mirrors
// fetchTenantConfig's domain-header + retry conventions (src/lib/tenant.ts).
import { DJANGO_API_URL } from "@/lib/constants";
import { getTenantDomain } from "@/lib/tenant";

export interface BlogPostPublic {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  meta_description?: string;
  noindex?: boolean;
  body_html?: string;
  published_at: string;
  cover_photo_url?: string | null;
}

async function domainHeader(): Promise<Record<string, string>> {
  const domain = (await getTenantDomain()).split(":")[0];
  return domain ? { "X-Tenant-Domain": domain } : {};
}

export async function fetchPublishedPosts(): Promise<BlogPostPublic[]> {
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/blog/posts/`, {
      headers: await domainHeader(),
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

export async function fetchPublishedPost(
  slug: string,
): Promise<BlogPostPublic | null> {
  try {
    const res = await fetch(
      `${DJANGO_API_URL}/api/v1/blog/posts/${encodeURIComponent(slug)}/`,
      {
        headers: await domainHeader(),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** A post by slug for the signed-in coach/owner, drafts included (null for
 *  everyone else). Lets the guided setup preview a draft before it's live. */
export async function fetchOwnerPreviewPost(
  slug: string,
): Promise<BlogPostPublic | null> {
  try {
    return await serverFetch<BlogPostPublic>(
      `/api/v1/blog/preview/${encodeURIComponent(slug)}/`,
      { cache: "no-store" },
    );
  } catch {
    return null;
  }
}
