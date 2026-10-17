// Thin client for AI-built sections (backend/apps/tenant_config/cx/views.py).
import { clientFetch } from "@/lib/api-client";
import type { CxSpec } from "@shared/cx/types";
import type { Block } from "@/types/tenant";

export type CxSource =
  | "ai"
  | "disabled"
  | "upgrade_required"
  | "quota_exhausted"
  | "error";

export interface CxResult {
  block: Block | null;
  source: CxSource;
  remaining: number;
  missing: string[];
}

export interface CxSaved {
  id: string;
  name: string;
  summary: string;
  ref: string;
  spec: CxSpec;
  content: Record<string, unknown>;
}

const MESSAGES: Record<Exclude<CxSource, "ai">, string> = {
  disabled: "AI design isn't available right now. Please try again later.",
  upgrade_required: "Custom sections come with the paid plans.",
  quota_exhausted:
    "You've used this month's AI changes. They renew next month.",
  error: "I couldn't build that. Try describing it a little differently.",
};

export const failureMessage = (source: CxSource) =>
  source === "ai" ? MESSAGES.error : MESSAGES[source];

export const composeSection = (prompt: string, page: string) =>
  clientFetch<CxResult>("/api/v1/admin/cx/compose/", {
    method: "POST",
    body: JSON.stringify({ prompt, page }),
  });

export const refineSection = (block: Block, instruction: string) =>
  clientFetch<CxResult>("/api/v1/admin/cx/refine/", {
    method: "POST",
    body: JSON.stringify({ block, instruction }),
  });

export const listMySections = () =>
  clientFetch<{ components: CxSaved[] }>("/api/v1/admin/cx/components/");

/** A fresh block from one of the coach's saved sections. */
export function blockFromSaved(saved: CxSaved, id: string): Block {
  return {
    ...structuredClone(saved.content),
    id,
    type: "cx",
    enabled: true,
    cx: { ref: saved.ref, spec: saved.spec },
  };
}

/** A block as an update patch (the editor keeps the existing id). */
export function withoutId(block: Block): Partial<Block> {
  return Object.fromEntries(
    Object.entries(block).filter(([key]) => key !== "id"),
  );
}
