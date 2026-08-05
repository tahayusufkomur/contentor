// Two call shapes: the conversational turn streams via streamAi (SSE), the
// confirmed-action mutation is a plain request via clientFetch.
import { clientFetch } from "@/lib/api-client";
import { streamAi, type AiStreamHandlers } from "@/lib/ai-stream";
import type { CopilotDone, ExecuteResult, SelectionPayload } from "./types";

const BASE = "/api/v1/admin/copilot";

export const converseCopilot = (
  body: {
    message: string;
    transcript: { role: string; text: string }[];
    selections: SelectionPayload[];
  },
  handlers: AiStreamHandlers<never>,
  signal?: AbortSignal,
) => streamAi<CopilotDone, never>(`${BASE}/converse/`, body, handlers, signal);

export const executeCopilotAction = (token: string) =>
  clientFetch<{ result: ExecuteResult }>(`${BASE}/execute/`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
