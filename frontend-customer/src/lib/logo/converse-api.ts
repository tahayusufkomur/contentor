// Thin client for the staged Design-with-AI endpoints. See
// backend/apps/tenant_config/views.py logo_converse / logo_converse_finish /
// logo_ai_status. The coach converges on ONE logo across three stages (icon,
// name, tagline); composeIconPreview/composeConverseDesign (composer.ts)
// materialize each returned ConverseDesign into a renderable recipe.
import { type AiStreamHandlers, streamAi } from "@/lib/ai-stream";
import { clientFetch } from "@/lib/api-client";
import type {
  BrandPackElement,
  BrandPackPath,
  ConverseDesign,
} from "@/lib/logo/composer";

export type ChatStage = "icon" | "name" | "tagline";

export interface LogoAiStatus {
  enabled: boolean;
  eligible: boolean;
  turns_remaining: number;
  refine_remaining: number;
  reason: "upgrade_required" | "quota_exhausted" | "disabled" | null;
}

export interface ConverseTurnResponse {
  phase: "draft" | "final";
  token?: string;
  message: string;
  designs: ConverseDesign[];
  turns_remaining: number;
  source:
    | "ai"
    | "draft"
    | "disabled"
    | "upgrade_required"
    | "quota_exhausted"
    | "error";
}

export function fetchLogoAiStatus(): Promise<LogoAiStatus> {
  return clientFetch<LogoAiStatus>("/api/v1/admin/config/logo-ai/status/");
}

export interface ConverseTurnBody {
  stage: ChatStage;
  brief: { niche: string; style_chips: string[]; vibe: string };
  transcript: { role: "user" | "assistant"; text: string }[];
  pinned: {
    mark_elements?: BrandPackElement[];
    mark_paths?: BrandPackPath[];
    lockup?: unknown;
  };
  message: string;
}

/** What the turn looks like mid-flight: the assistant's reply forming, plus
 * each candidate's concept line as it lands. */
export interface TurnPreview {
  message: string;
  concepts: string[];
}

/** Streaming twin of fetchConverseTurn. Same terminal payload, but reports
 * the real steps — designing, then (icon stage) illustrating and tracing —
 * so a multi-minute turn doesn't read as a hang.
 *
 * NOTE: cancelling via `signal` still consumes a turn. The server commits it
 * at the first preview, and on the icon stage the costly image + trace work
 * runs after that point, so a late bail has genuinely spent money. */
export function fetchConverseTurnStream(
  body: ConverseTurnBody,
  handlers: AiStreamHandlers<TurnPreview>,
  signal?: AbortSignal,
): Promise<ConverseTurnResponse> {
  return streamAi<ConverseTurnResponse, TurnPreview>(
    "/api/v1/admin/config/logo-converse/",
    body,
    handlers,
    signal,
  );
}

export function fetchConverseTurn(
  body: ConverseTurnBody,
): Promise<ConverseTurnResponse> {
  return clientFetch<ConverseTurnResponse>(
    "/api/v1/admin/config/logo-converse/",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function fetchConverseFinish(
  token: string,
  images: string[],
): Promise<ConverseTurnResponse> {
  return clientFetch<ConverseTurnResponse>(
    "/api/v1/admin/config/logo-converse/finish/",
    {
      method: "POST",
      body: JSON.stringify({ token, images }),
    },
  );
}
