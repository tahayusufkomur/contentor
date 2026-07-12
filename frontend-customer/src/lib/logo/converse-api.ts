// Thin client for the staged Design-with-AI endpoints. See
// backend/apps/tenant_config/views.py logo_converse / logo_converse_finish /
// logo_ai_status. The coach converges on ONE logo across three stages (icon,
// name, tagline); composeIconPreview/composeConverseDesign (composer.ts)
// materialize each returned ConverseDesign into a renderable recipe.
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

export function fetchConverseTurn(body: {
  stage: ChatStage;
  brief: { niche: string; style_chips: string[]; vibe: string };
  transcript: { role: "user" | "assistant"; text: string }[];
  pinned: {
    mark_elements?: BrandPackElement[];
    mark_paths?: BrandPackPath[];
    lockup?: unknown;
  };
  message: string;
}): Promise<ConverseTurnResponse> {
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
