// Two call shapes: the conversational turn streams via streamAi (SSE), the
// confirmed-action mutation is a plain request via clientFetch.
import { clientFetch } from "@/lib/api-client";
import { streamAi, type AiStreamHandlers } from "@/lib/ai-stream";
import type {
  ChatEntry,
  CopilotAuditEntry,
  CopilotChatDetail,
  CopilotChatRow,
  CopilotDone,
  ExecuteResponse,
  SelectionPayload,
} from "./types";

const BASE = "/api/v1/admin/copilot";

export const converseCopilot = (
  body: {
    message: string;
    transcript: { role: string; text: string; kind?: string }[];
    selections: SelectionPayload[];
    attached_photos?: string[];
  },
  handlers: AiStreamHandlers<never>,
  signal?: AbortSignal,
) => streamAi<CopilotDone, never>(`${BASE}/converse/`, body, handlers, signal);

export const fetchCopilotChats = () =>
  clientFetch<{ chats: CopilotChatRow[] }>(`${BASE}/chats/`);

export const createCopilotChat = (entries: ChatEntry[] = [], title = "") =>
  clientFetch<CopilotChatDetail>(`${BASE}/chats/`, {
    method: "POST",
    body: JSON.stringify({ entries, title }),
  });

export const fetchCopilotChat = (id: number) =>
  clientFetch<CopilotChatDetail>(`${BASE}/chats/${id}/`);

export const patchCopilotChatEntries = (id: number, entries: ChatEntry[]) =>
  clientFetch<CopilotChatDetail>(`${BASE}/chats/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ entries }),
  });

export const deleteCopilotChat = (id: number) =>
  clientFetch<void>(`${BASE}/chats/${id}/`, { method: "DELETE" });

export const executeCopilotAction = (token: string) =>
  clientFetch<ExecuteResponse>(`${BASE}/execute/`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export const undoCopilotAction = (auditId: number) =>
  clientFetch<{ undone: string }>(`${BASE}/undo/`, {
    method: "POST",
    body: JSON.stringify({ audit_id: auditId }),
  });

export const fetchCopilotAudit = () =>
  clientFetch<{ entries: CopilotAuditEntry[] }>(`${BASE}/audit/`);
