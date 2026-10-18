import {
  BookOpen,
  Megaphone,
  Palette,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { activeSection, buildAdminNav } from "@/lib/admin-nav";
import { isNavItemActive } from "@shared/navigation/navigation-state";
import type { ActionKind } from "./types";

/** The creator's team: six specialists on the one copilot engine. Mirrors
 *  backend/apps/core/copilot/team.py (team.test.ts keeps the two in step);
 *  names, jobs and starters live in messages/en/admin.json under `team`. */
export const SPECIALIST_KEYS = [
  "designer",
  "content",
  "marketing",
  "community",
  "finance",
  "assistant",
] as const;
export type SpecialistKey = (typeof SPECIALIST_KEYS)[number];

/** Colour is data here, not a theme token: it fills a specialist's face
 *  under a white icon. Names stay in the foreground colour, so both studio
 *  themes read. */
export const SPECIALIST_LOOK: Record<
  SpecialistKey,
  { color: string; icon: LucideIcon }
> = {
  designer: { color: "#7c5cd6", icon: Palette },
  content: { color: "#0e8f7e", icon: BookOpen },
  marketing: { color: "#d9622b", icon: Megaphone },
  community: { color: "#c9437a", icon: Users },
  finance: { color: "#2f8f4e", icon: TrendingUp },
  assistant: { color: "#3a6fd8", icon: Sparkles },
};

/** Who signs each kind of action. The backend also gives a price-only edit
 *  to the Financial Strategist and a message to whichever of its two owners
 *  wrote it; cards arrive with that owner already set. */
export const OWNERS: Record<ActionKind, SpecialistKey> = {
  edit_pages: "designer",
  add_block: "designer",
  remove_block: "designer",
  move_block: "designer",
  edit_block_fields: "designer",
  toggle_block: "designer",
  duplicate_block: "designer",
  edit_style: "designer",
  edit_navbar: "designer",
  set_block_image: "designer",
  set_logo: "designer",
  note_photo: "designer",
  set_course_cover: "designer",
  set_event_cover: "designer",
  create_course: "content",
  edit_course: "content",
  edit_curriculum: "content",
  publish_course: "content",
  create_event: "content",
  edit_event: "content",
  create_blog_post: "marketing",
  edit_blog_post: "marketing",
  publish_blog_post: "marketing",
  edit_seo: "marketing",
  draft_announcement: "community",
};

/** A known specialist, else the Assistant (chats saved before the team
 *  existed have no specialist on their replies). */
export const asSpecialist = (value: unknown): SpecialistKey =>
  (SPECIALIST_KEYS as readonly unknown[]).includes(value)
    ? (value as SpecialistKey)
    : "assistant";

export const ownerOf = (kind: string): SpecialistKey =>
  OWNERS[kind as ActionKind] ?? "assistant";

/** Who signs a History row: the owner of its kind, except a kept cover, which is signed by whoever made it
 *  (`by` is the maker's key, or empty for a cover she made herself, which shows as hers). */
export const signerOf = (entry: {
  kind: string;
  by: string;
}): SpecialistKey | "you" => {
  if (entry.kind !== "keep_cover") return ownerOf(entry.kind);
  return entry.by ? asSpecialist(entry.by) : "you";
};

const SECTION_SPECIALIST: Record<string, SpecialistKey> = {
  home: "assistant",
  teach: "content",
  students: "community",
  reachOut: "marketing",
  money: "finance",
  site: "designer",
  settings: "assistant",
};

/** Who answers first on a page: the specialist running its section. The
 *  student assistant's console sits under Site but is the Assistant's; off
 *  the studio (the public site, the site editor) it is the Designer. */
export function specialistFor(pathname: string | null): SpecialistKey {
  if (!pathname) return "assistant";
  if (!pathname.startsWith("/admin")) return "designer";
  const state = { pathname, pendingHref: null };
  const section = activeSection(
    buildAdminNav((key) => key),
    state,
  );
  if (!section) return "assistant";
  const studentAssistant = section.items.find((i) => i.key === "assistant");
  if (studentAssistant && isNavItemActive(state, studentAssistant.href)) {
    return "assistant";
  }
  return SECTION_SPECIALIST[section.id] ?? "assistant";
}
