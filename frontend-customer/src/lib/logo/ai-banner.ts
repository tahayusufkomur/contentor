import type { BrandPackStatus } from "./brand-pack-api";
import type { LogoRecipe } from "@/types/logo";

export const AI_DEFAULT_IDLE_DESCRIPTION =
  "Bespoke marks + palettes, made for your brand — takes about 2 minutes.";

/** Elapsed-seconds -> {percent, label} checkpoints for the AI Brand Pack
 * progress banner. Based on measured real-world generation times
 * (106-134s, CLI/haiku provider, dev container, 2026-07-10). Never
 * reaches 100% — holds at the last checkpoint until the real response
 * lands, since the underlying call is a single blocking request with no
 * true progress signal (see docs/superpowers/specs/2026-07-10-logo-studio-ai-trigger-design.md). */
const PROGRESS_CHECKPOINTS: {
  atSeconds: number;
  percent: number;
  label: string;
}[] = [
  { atSeconds: 0, percent: 8, label: "Sketching your marks…" },
  { atSeconds: 10, percent: 25, label: "Sketching your marks…" },
  { atSeconds: 25, percent: 45, label: "Choosing brand colors…" },
  { atSeconds: 50, percent: 65, label: "Choosing brand colors…" },
  { atSeconds: 80, percent: 80, label: "Polishing the details…" },
  { atSeconds: 110, percent: 90, label: "Almost there…" },
];

export function progressForElapsed(elapsedSeconds: number): {
  percent: number;
  label: string;
} {
  let current = PROGRESS_CHECKPOINTS[0];
  for (const checkpoint of PROGRESS_CHECKPOINTS) {
    if (elapsedSeconds >= checkpoint.atSeconds) current = checkpoint;
  }
  return { percent: current.percent, label: current.label };
}

export type AiBannerState =
  | { kind: "hidden" }
  | { kind: "upsell" }
  | { kind: "idle"; description: string }
  | { kind: "generating"; percent: number; label: string }
  | { kind: "quota_exhausted" }
  | { kind: "disabled" };

/** Single source of truth for what the Logo Studio's AI banner shows.
 * `brandPackStatus.reason` (computed server-side in
 * `_brand_pack_status`) is authoritative for the non-loading,
 * no-results states — this never re-derives eligibility/quota from
 * `enabled`/`remaining` itself, to avoid drifting from the backend. */
export function deriveAiBannerState(params: {
  brandPackStatus: BrandPackStatus | null | undefined;
  aiLoading: boolean;
  aiWall: LogoRecipe[] | null | undefined;
  aiNotice: string | null | undefined;
  elapsedSeconds: number;
}): AiBannerState {
  const { brandPackStatus, aiLoading, aiWall, aiNotice, elapsedSeconds } =
    params;

  if (!brandPackStatus) return { kind: "hidden" };
  if (aiLoading) {
    const { percent, label } = progressForElapsed(elapsedSeconds);
    return { kind: "generating", percent, label };
  }
  if (aiWall && aiWall.length > 0) return { kind: "hidden" };

  switch (brandPackStatus.reason) {
    case "upgrade_required":
      return { kind: "upsell" };
    case "disabled":
      return { kind: "disabled" };
    case "quota_exhausted":
      return { kind: "quota_exhausted" };
    default:
      return {
        kind: "idle",
        description: aiNotice ?? AI_DEFAULT_IDLE_DESCRIPTION,
      };
  }
}
