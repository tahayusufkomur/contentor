// Mirrors lib/site-ai-api.ts's split: streaming turn via streamAi, plain
// mutation via clientFetch.
import { clientFetch } from "@/lib/api-client";
import { streamAi, type AiStreamHandlers } from "@/lib/ai-stream";
import type { CopilotDone, SelectionPayload } from "./types";

const BASE = "/api/v1/admin/copilot";

export const converseCopilot = (
  body: { message: string; transcript: { role: string; text: string }[]; selections: SelectionPayload[] },
  handlers: AiStreamHandlers<never>,
  signal?: AbortSignal,
) => streamAi<CopilotDone, never>(`${BASE}/converse/`, body, handlers, signal);

export const executeCopilotAction = (token: string) =>
  clientFetch<{ result: { kind: string; changes_count?: number; page?: string } }>(`${BASE}/execute/`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
