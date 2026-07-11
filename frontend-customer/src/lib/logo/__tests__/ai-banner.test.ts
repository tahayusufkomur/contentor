import { describe, expect, it } from "vitest";
import {
  AI_DEFAULT_IDLE_DESCRIPTION,
  deriveAiBannerState,
} from "@/lib/logo/ai-banner";
import type { LogoAiStatus } from "@/lib/logo/converse-api";

function baseStatus(overrides: Partial<LogoAiStatus> = {}): LogoAiStatus {
  return {
    enabled: true,
    eligible: true,
    turns_remaining: 5,
    refine_remaining: 20,
    reason: null,
    ...overrides,
  };
}

describe("deriveAiBannerState", () => {
  it("is hidden when status hasn't loaded yet", () => {
    expect(deriveAiBannerState({ status: null })).toEqual({ kind: "hidden" });
  });

  it("maps reason upgrade_required to upsell", () => {
    expect(
      deriveAiBannerState({
        status: baseStatus({ eligible: false, reason: "upgrade_required" }),
      }),
    ).toEqual({ kind: "upsell" });
  });

  it("maps reason disabled to disabled", () => {
    expect(
      deriveAiBannerState({
        status: baseStatus({ enabled: false, reason: "disabled" }),
      }),
    ).toEqual({ kind: "disabled" });
  });

  it("maps reason quota_exhausted to quota_exhausted", () => {
    expect(
      deriveAiBannerState({
        status: baseStatus({ turns_remaining: 0, reason: "quota_exhausted" }),
      }),
    ).toEqual({ kind: "quota_exhausted" });
  });

  it("is idle with the default (1-on-1 session) description when reason is null", () => {
    const state = deriveAiBannerState({ status: baseStatus() });
    expect(state).toEqual({
      kind: "idle",
      description: AI_DEFAULT_IDLE_DESCRIPTION,
    });
    expect(AI_DEFAULT_IDLE_DESCRIPTION).toMatch(/1-on-1|one-on-one|1 on 1/i);
  });
});
