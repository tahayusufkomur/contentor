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

export type ActionKind =
  | "edit_pages"
  | "add_block"
  | "remove_block"
  | "move_block"
  | "edit_block_fields"
  | "toggle_block"
  | "duplicate_block"
  | "create_course"
  | "create_event"
  | "create_blog_post"
  | "edit_theme"
  | "edit_navbar"
  | "set_block_image"
  | "set_course_cover";

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
}

export interface ChatEntry {
  role: "coach" | "assistant";
  text: string;
  cards?: ActionCard[];
  kind?: CopilotDone["kind"];
  /** Photos the coach attached to this message — kept in the transcript so
   * follow-up turns ("use it as the logo") can still reference the ids.
   * desc = the vision caption, so the model knows what each photo shows.
   * signed_url = presigned thumbnail for the chat bubble (24h; the chip
   * falls back to title-only once it expires). Never sent to the model. */
  attached?: { id: string; title: string; desc?: string; signed_url?: string }[];
}

export interface CopilotAuditEntry {
  id: number;
  kind: string;
  summary: string;
  created_at: string;
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
