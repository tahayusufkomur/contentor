import { clientFetch } from "@/lib/api-client";
import type {
  CommunityComment,
  CommunityPost,
  CommunitySettings,
} from "@/types/community";

const BASE = "/api/v1/community";
const MOD = `${BASE}/moderation`;

export interface QueueReport {
  id: number;
  reason: string;
  detail: string;
  status: string;
  created_at: string;
  reporter: { display_name: string };
  target_type: "post" | "comment";
  post: CommunityPost | null;
  comment: CommunityComment | null;
}

export interface ModerationQueue {
  reports: QueueReport[];
  pending_posts: CommunityPost[];
}

export interface ModerationMember {
  id: number;
  display_name: string;
  email: string;
  joined_at: string;
  is_banned: boolean;
  muted_until: string | null;
  requires_approval: boolean;
  post_count: number;
}

const post = (path: string, body?: unknown) =>
  clientFetch<void>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

export const getModerationQueue = () =>
  clientFetch<ModerationQueue>(`${MOD}/queue/`);
export const resolveReport = (id: number, action: "remove" | "keep") =>
  post(`${MOD}/reports/${id}/resolve/`, { action });
export const pinPost = (id: number) => post(`${MOD}/posts/${id}/pin/`);
export const unpinPost = (id: number) => post(`${MOD}/posts/${id}/unpin/`);
export const removePost = (id: number) => post(`${MOD}/posts/${id}/remove/`);
export const approvePost = (id: number) => post(`${MOD}/posts/${id}/approve/`);
export const removeCommentMod = (id: number) =>
  post(`${MOD}/comments/${id}/remove/`);
export const getMembers = (q = "") =>
  clientFetch<{ results: ModerationMember[] }>(
    `${MOD}/members/${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );
export const banMember = (id: number) => post(`${MOD}/members/${id}/ban/`);
export const unbanMember = (id: number) => post(`${MOD}/members/${id}/unban/`);
export const muteMember = (id: number, days: number) =>
  post(`${MOD}/members/${id}/mute/`, { days });
export const setRequiresApproval = (id: number, value: boolean) =>
  post(`${MOD}/members/${id}/require-approval/`, { value });
export const getAdminSettings = () =>
  clientFetch<CommunitySettings>(`${BASE}/settings/`);
export const patchAdminSettings = (patch: Partial<CommunitySettings>) =>
  clientFetch<CommunitySettings>(`${BASE}/settings/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
