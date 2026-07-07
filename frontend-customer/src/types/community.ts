export const REACTION_EMOJIS = ["❤️", "👍", "🎉", "💪", "😂"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export interface CommunityAuthor {
  id: number;
  display_name: string;
  avatar: string;
  is_coach: boolean;
}

export interface CommunityPost {
  id: number;
  author: CommunityAuthor;
  body: string;
  image_keys: string[];
  images: string[];
  status: "visible" | "pending" | "hidden" | "removed";
  is_pinned: boolean;
  comment_count: number;
  reaction_count: number;
  my_reaction: string | null;
  created_at: string;
  edited_at: string | null;
}

export interface CommunityComment {
  id: number;
  author: CommunityAuthor;
  body: string;
  reaction_count: number;
  my_reaction: string | null;
  status: string;
  created_at: string;
}

export interface CommunityFeedPage {
  results: CommunityPost[];
  next: string | null;
  previous: string | null;
  /** Present only on the first page (no cursor param). */
  pinned?: CommunityPost[];
  welcome_message?: string;
}

export interface CommunityCommentsPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: CommunityComment[];
}

export interface CommunityMe {
  id: number;
  display_name: string;
  avatar_key: string;
  avatar: string;
  joined_at: string;
  is_moderator: boolean;
}

export interface CommunitySettings {
  is_enabled: boolean;
  welcome_message: string;
  /** Moderators only. */
  notify_on_coach_post?: boolean;
}
