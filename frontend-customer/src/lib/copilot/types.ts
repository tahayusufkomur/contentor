import type { SpecialistKey } from "./team";

export interface SelectionPayload {
  path: string;
  block_id: string | null;
  tag: string;
  text: string;
  context: string;
}

export interface DiffRow {
  page: string;
  block_type: string;
  field: string;
  old: string | null;
  new: string | null;
}

/** Every action the backend can propose (apps/core/copilot/engine.py); a unit
 * test fails when the two lists drift. */
export const ACTION_KINDS = [
  "edit_pages",
  "add_block",
  "remove_block",
  "move_block",
  "edit_block_fields",
  "toggle_block",
  "duplicate_block",
  "create_course",
  "create_event",
  "create_blog_post",
  "draft_announcement",
  "edit_style",
  "edit_navbar",
  "edit_seo",
  "set_block_image",
  "set_course_cover",
  "set_event_cover",
  "set_logo",
  "note_photo",
  "edit_course",
  "edit_curriculum",
  "edit_event",
  "edit_blog_post",
  "publish_course",
  "publish_blog_post",
  "set_access",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Where she is when she talks to the assistant. The server matches the path
 * against its own table of admin pages and looks the record up itself. */
export interface CopilotContext {
  path: string;
  /** Set by "Describe it" beside a create button. */
  intent?: "draft_course" | "draft_event";
}

export interface ActionCard {
  kind: ActionKind;
  title: string;
  detail: string;
  changes?: DiffRow[];
  image_url?: string;
  /** Curated photo/logo picks arrive flagged — the card plays a brief
   * "creating your photo" reveal before showing the image. */
  reveal?: boolean;
  token: string;
  /** The specialist who signs this work. */
  owner?: SpecialistKey;
}

export interface ExecuteResult {
  kind: string;
  changes_count?: number;
  page?: string;
  id?: number;
  title?: string;
  url?: string;
}

export interface ExecuteResponse {
  result: ExecuteResult;
  audit_id: number | null;
}

export interface CopilotDone {
  kind: "answer" | "ask" | "actions" | "unavailable";
  text?: string;
  actions?: ActionCard[];
  /** Who on the team answered. */
  specialist?: SpecialistKey;
}

/** Where a run of the team's work stands (apps.core.copilot.runs). */
export type RunStatus =
  | "queued"
  | "thinking"
  | "working"
  | "done"
  | "stopped"
  | "failed";

export interface RunEvent {
  seq: number;
  type: string;
  data: Record<string, unknown>;
  at: string;
}

export interface RunDetail {
  id: number;
  status: RunStatus;
  specialist: SpecialistKey;
  chat: number | null;
  seen: boolean;
  /** Only the events after the `since` the client asked with. */
  events: RunEvent[];
}

/** One of her runs still going, or finished and not seen yet. */
export interface OpenRun {
  id: number;
  status: RunStatus;
  specialist: SpecialistKey;
  chat: number | null;
  summary: string;
  finished_at: string | null;
}

export interface ChatEntry {
  role: "coach" | "assistant";
  text: string;
  cards?: ActionCard[];
  /** pending: the run is still working; stopped/failed: a short note in
   * its place. None of the three ever reaches the model. */
  kind?: CopilotDone["kind"] | "pending" | "stopped" | "failed";
  /** Who on the team wrote an assistant reply. */
  specialist?: SpecialistKey;
  /** The run behind an assistant reply (rung 1b): a pending entry resumes
   * from it after a reload. */
  run?: number;
  /** Photos the coach attached to this message — kept in the transcript so
   * follow-up turns ("use it as the logo") can still reference the ids.
   * desc = the vision caption, so the model knows what each photo shows.
   * signed_url = presigned thumbnail for the chat bubble (24h; the chip
   * falls back to title-only once it expires). Never sent to the model. */
  attached?: {
    id: string;
    title: string;
    desc?: string;
    signed_url?: string;
  }[];
}

export interface CopilotAuditEntry {
  id: number;
  kind: string;
  summary: string;
  created_at: string;
  undone: boolean;
  /** Undo would still work on this row right now. */
  undoable: boolean;
  /** Who made the change: a specialist's key, or "" for a change she made herself. */
  by: string;
}

export interface CopilotChatRow {
  id: number;
  title: string;
  updated_at: string;
}

export interface CopilotChatDetail extends CopilotChatRow {
  entries: ChatEntry[];
}

/** A photo the coach attached to the composer, already uploaded to their
 * media library — the id travels with the next converse call. desc is the
 * vision caption (may be empty when no vision provider is available). */
export interface AttachedPhoto {
  id: string;
  title: string;
  signed_url: string;
  desc: string;
}
