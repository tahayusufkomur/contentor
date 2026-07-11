import { describe, expect, it } from "vitest";
import {
  AI_DEFAULT_IDLE_DESCRIPTION,
  deriveAiBannerState,
  progressForElapsed,
} from "@/lib/logo/ai-banner";
import type { BrandPackStatus } from "@/lib/logo/brand-pack-api";
import type { LogoRecipe } from "@/types/logo";

function baseStatus(overrides: Partial<BrandPackStatus> = {}): BrandPackStatus {
  return {
    enabled: true,
    eligible: true,
    remaining: 5,
    reason: null,
    ...overrides,
  };
}

const SOME_RECIPE = {} as LogoRecipe; // opaque to deriveAiBannerState — only array length/truthiness matters

describe("progressForElapsed", () => {
  it("starts at 8% / Sketching your marks…", () => {
    expect(progressForElapsed(0)).toEqual({
      percent: 8,
      label: "Sketching your marks…",
    });
  });

  it("holds the checkpoint value until the next threshold", () => {
    expect(progressForElapsed(9)).toEqual({
      percent: 8,
      label: "Sketching your marks…",
    });
    expect(progressForElapsed(24)).toEqual({
      percent: 25,
      label: "Sketching your marks…",
    });
    expect(progressForElapsed(49)).toEqual({
      percent: 45,
      label: "Choosing brand colors…",
    });
    expect(progressForElapsed(79)).toEqual({
      percent: 65,
      label: "Choosing brand colors…",
    });
    expect(progressForElapsed(109)).toEqual({
      percent: 80,
      label: "Polishing the details…",
    });
  });

  it("reaches the final checkpoint at 110s and holds past it", () => {
    expect(progressForElapsed(110)).toEqual({
      percent: 90,
      label: "Almost there…",
    });
    expect(progressForElapsed(500)).toEqual({
      percent: 90,
      label: "Almost there…",
    });
  });
});

describe("deriveAiBannerState", () => {
  const commonArgs = {
    aiLoading: false,
    aiWall: null,
    aiNotice: null,
    elapsedSeconds: 0,
  };

  it("is hidden when status hasn't loaded yet", () => {
    expect(
      deriveAiBannerState({ ...commonArgs, brandPackStatus: null }),
    ).toEqual({ kind: "hidden" });
  });

  it("is generating (with checkpoint values) whenever aiLoading is true, regardless of reason", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus(),
        aiLoading: true,
        elapsedSeconds: 30,
      }),
    ).toEqual({
      kind: "generating",
      percent: 45,
      label: "Choosing brand colors…",
    });
  });

  it("is hidden once aiWall has results, even if aiLoading is false", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus(),
        aiWall: [SOME_RECIPE],
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("is NOT hidden for an empty aiWall array — falls through to idle", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus(),
        aiWall: [],
      }),
    ).toEqual({ kind: "idle", description: AI_DEFAULT_IDLE_DESCRIPTION });
  });

  it("maps reason upgrade_required to upsell", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus({
          eligible: false,
          reason: "upgrade_required",
        }),
      }),
    ).toEqual({ kind: "upsell" });
  });

  it("maps reason disabled to disabled", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus({ enabled: false, reason: "disabled" }),
      }),
    ).toEqual({ kind: "disabled" });
  });

  it("maps reason quota_exhausted to quota_exhausted", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus({
          remaining: 0,
          reason: "quota_exhausted",
        }),
      }),
    ).toEqual({ kind: "quota_exhausted" });
  });

  it("is idle with the default description when reason is null and no notice is set", () => {
    expect(
      deriveAiBannerState({ ...commonArgs, brandPackStatus: baseStatus() }),
    ).toEqual({ kind: "idle", description: AI_DEFAULT_IDLE_DESCRIPTION });
  });

  it("is idle with the notice text (e.g. after an error) when aiNotice is set", () => {
    expect(
      deriveAiBannerState({
        ...commonArgs,
        brandPackStatus: baseStatus(),
        aiNotice: "Couldn't reach the design studio — try again.",
      }),
    ).toEqual({
      kind: "idle",
      description: "Couldn't reach the design studio — try again.",
    });
  });
});
