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
  | "create_course"
  | "create_event"
  | "create_blog_post";

export interface ActionCard {
  kind: ActionKind;
  title: string;
  detail: string;
  changes?: DiffRow[];
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

export interface CopilotDone {
  kind: "answer" | "ask" | "actions" | "unavailable";
  text?: string;
  actions?: ActionCard[];
}

export interface ChatEntry {
  role: "coach" | "assistant";
  text: string;
  cards?: ActionCard[];
}
