import { clientFetch } from "@/lib/api-client";
import type {
  CommunityCommentsPage,
  CommunityComment,
  CommunityFeedPage,
  CommunityMe,
  CommunityPost,
  CommunitySettings,
  ReportReason,
} from "@/types/community";

const BASE = "/api/v1/community";

export type TargetKind = "posts" | "comments";

export function getCommunitySettings(): Promise<CommunitySettings> {
  return clientFetch(`${BASE}/settings/`);
}

export function getCommunityMe(): Promise<CommunityMe> {
  return clientFetch(`${BASE}/me/`);
}

export function updateCommunityMe(
  patch: Partial<Pick<CommunityMe, "display_name" | "avatar_key">>,
): Promise<CommunityMe> {
  return clientFetch(`${BASE}/me/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Presign + PUT the file to object storage. Returns the s3_key to attach. */
export async function uploadCommunityImage(file: File): Promise<string> {
  const presign = await clientFetch<{
    upload_url: string;
    s3_key: string;
    headers: Record<string, string>;
  }>(`${BASE}/presign/`, {
    method: "POST",
    body: JSON.stringify({ filename: file.name, content_type: file.type }),
  });
  const put = await fetch(presign.upload_url, {
    method: "PUT",
    headers: presign.headers,
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return presign.s3_key;
}

/** First page when url is omitted; pass page.next verbatim for more. */
export function getFeed(url?: string | null): Promise<CommunityFeedPage> {
  return clientFetch(url || `${BASE}/posts/`);
}

export function createPost(input: {
  body: string;
  image_keys?: string[];
}): Promise<CommunityPost> {
  return clientFetch(`${BASE}/posts/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePost(id: number, body: string): Promise<CommunityPost> {
  return clientFetch(`${BASE}/posts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export function deletePost(id: number): Promise<void> {
  return clientFetch(`${BASE}/posts/${id}/`, { method: "DELETE" });
}

export function getComments(
  postId: number,
  page = 1,
): Promise<CommunityCommentsPage> {
  return clientFetch(`${BASE}/posts/${postId}/comments/?page=${page}`);
}

export function addComment(
  postId: number,
  body: string,
): Promise<CommunityComment> {
  return clientFetch(`${BASE}/posts/${postId}/comments/`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteComment(id: number): Promise<void> {
  return clientFetch(`${BASE}/comments/${id}/`, { method: "DELETE" });
}

export function setReaction(
  kind: TargetKind,
  id: number,
  emoji: string,
): Promise<void> {
  return clientFetch(`${BASE}/${kind}/${id}/reaction/`, {
    method: "PUT",
    body: JSON.stringify({ emoji }),
  });
}

export function clearReaction(kind: TargetKind, id: number): Promise<void> {
  return clientFetch(`${BASE}/${kind}/${id}/reaction/`, { method: "DELETE" });
}

export function reportTarget(
  kind: TargetKind,
  id: number,
  reason: ReportReason,
  detail = "",
): Promise<void> {
  return clientFetch(`${BASE}/${kind}/${id}/report/`, {
    method: "POST",
    body: JSON.stringify({ reason, detail }),
  });
}
