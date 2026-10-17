// Two call shapes: the conversational turn streams via streamAi (SSE), the
// confirmed-action mutation is a plain request via clientFetch.
import { clientFetch } from "@/lib/api-client";
import { streamAi, type AiStreamHandlers } from "@/lib/ai-stream";
import type {
  ChatEntry,
  CopilotAuditEntry,
  CopilotChatDetail,
  CopilotChatRow,
  CopilotContext,
  CopilotDone,
  ExecuteResponse,
  OpenRun,
  RunDetail,
  RunStatus,
  SelectionPayload,
} from "./types";
import type { SpecialistKey } from "./team";

const BASE = "/api/v1/admin/copilot";

export interface ConverseBody {
  message: string;
  transcript: { role: string; text: string; kind?: string }[];
  selections: SelectionPayload[];
  attached_photos?: string[];
  context?: CopilotContext;
  /** Who on the team answers this turn. */
  specialist?: SpecialistKey;
}

export const converseCopilot = (
  body: ConverseBody,
  handlers: AiStreamHandlers<never>,
  signal?: AbortSignal,
) => streamAi<CopilotDone, never>(`${BASE}/converse/`, body, handlers, signal);

/** The Team panel's turns run on the server (rung 1b): start one, then
 * follow its events (lib/copilot/runs.ts). */
export const startRun = (body: ConverseBody & { chat?: number | null }) =>
  clientFetch<
    | { id: number; status: RunStatus; specialist: SpecialistKey }
    | { kind: "unavailable" }
  >(`${BASE}/runs/`, { method: "POST", body: JSON.stringify(body) });

export const fetchRun = (id: number, since = 0) =>
  clientFetch<RunDetail>(`${BASE}/runs/${id}/?since=${since}`);

export const fetchOpenRuns = () =>
  clientFetch<{ runs: OpenRun[] }>(`${BASE}/runs/open/`);

export const stopRun = (id: number) =>
  clientFetch<{ status: RunStatus }>(`${BASE}/runs/${id}/stop/`, {
    method: "POST",
  });

export const markRunSeen = (id: number) =>
  clientFetch<void>(`${BASE}/runs/${id}/seen/`, { method: "POST" });

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
  clientFetch<{ undone: string; id: number | null }>(`${BASE}/undo/`, {
    method: "POST",
    body: JSON.stringify({ audit_id: auditId }),
  });

export const fetchCopilotAudit = () =>
  clientFetch<{ entries: CopilotAuditEntry[] }>(`${BASE}/audit/`);
