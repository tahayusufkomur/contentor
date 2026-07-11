import type { LogoAiStatus } from "@/lib/logo/converse-api";

export const AI_DEFAULT_IDLE_DESCRIPTION =
  "Design your logo in a quick 1-on-1 session with the AI designer.";

export type AiBannerState =
  | { kind: "hidden" }
  | { kind: "upsell" }
  | { kind: "idle"; description: string }
  | { kind: "quota_exhausted" }
  | { kind: "disabled" };

/** Single source of truth for the Design-with-AI CTA banner above the wall.
 * Progress no longer lives here — the staged chat owns "designing" /
 * "reviewing" feedback now — so this only keys off the server-authoritative
 * `status.reason` (computed in logo_ai_status). It never re-derives
 * eligibility/quota from `enabled`/`remaining` itself, to avoid drifting from
 * the backend. */
export function deriveAiBannerState(params: {
  status: LogoAiStatus | null;
}): AiBannerState {
  const { status } = params;
  if (!status) return { kind: "hidden" };

  switch (status.reason) {
    case "upgrade_required":
      return { kind: "upsell" };
    case "disabled":
      return { kind: "disabled" };
    case "quota_exhausted":
      return { kind: "quota_exhausted" };
    default:
      return { kind: "idle", description: AI_DEFAULT_IDLE_DESCRIPTION };
  }
}
