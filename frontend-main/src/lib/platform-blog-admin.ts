// Superadmin platform blog API client, base `/api/v1/platform/blog`. Auth
// rides the same-origin admin cookie (shared api-client).

import { jsonFetch } from "./api-client";

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

const BASE = "/api/v1/platform/blog";

export const listPlatformPosts = () =>
  jsonFetch<{ results: PlatformBlogPostAdmin[] }>(`${BASE}/posts/`);

export const generatePlatformPost = (body: {
  topic: string;
  instructions?: string;
}) =>
  jsonFetch<GenerateResponse>(`${BASE}/generate/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
