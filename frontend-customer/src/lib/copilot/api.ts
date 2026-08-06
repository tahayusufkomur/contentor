// Two call shapes: the conversational turn streams via streamAi (SSE), the
// confirmed-action mutation is a plain request via clientFetch.
import { clientFetch } from "@/lib/api-client";
import { streamAi, type AiStreamHandlers } from "@/lib/ai-stream";
import type {
  CopilotAuditEntry,
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
  },
  handlers: AiStreamHandlers<never>,
  signal?: AbortSignal,
) => streamAi<CopilotDone, never>(`${BASE}/converse/`, body, handlers, signal);

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
