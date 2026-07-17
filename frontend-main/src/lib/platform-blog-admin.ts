// Superadmin platform blog API client, base `/api/v1/platform/blog`. Auth
// rides the same-origin admin cookie (mirrors platform-email-api.ts).

export interface PlatformBlogPostAdmin {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  meta_description: string;
  tags: string[];
  body_html: string;
  status: "draft" | "published";
  source: "manual" | "ai";
  published_at: string | null;
}

export interface GenerateResponse {
  post: PlatformBlogPostAdmin | null;
  source: "ai" | "budget" | "error";
}

async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(String(detail));
  }
  return res.json();
}

const BASE = "/api/v1/platform/blog";

export const listPlatformPosts = () =>
  clientFetch<{ results: PlatformBlogPostAdmin[] }>(`${BASE}/posts/`);

export const generatePlatformPost = (body: {
  topic: string;
  instructions?: string;
}) =>
  clientFetch<GenerateResponse>(`${BASE}/generate/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
