/** Wizard Logo Design-with-AI API client. NOT a mirror — these are
 * wizard-token-authenticated fetchers for the phase-3 wizard endpoints
 * (backend/apps/core/onboarding/wizard_logo.py), following the same
 * `request()` idiom as lib/wizard/api.ts. Token rides in the BODY (never the
 * URL) — same convention as the rest of the wizard client.
 *
 * `ConverseTurnResponse` / `RefineResponse` shapes are copied from
 * frontend-customer/src/lib/logo/converse-api.ts and refine-api.ts (those
 * files themselves are NOT mirrored — the wizard doesn't use their
 * tenant-authenticated fetchers, only these response shapes). `designRecipe`
 * wraps composer.ts's `composeConverseDesign` — the same accessor the
 * studio's design cards (studio-chat.tsx) use to turn a ConverseDesign into
 * a renderable LogoRecipe. */

import { composeConverseDesign, type ConverseDesign, type RefinedDesign } from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";
import { ApiError } from "@/types/api";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json() as Promise<T>;
}

export interface WizardLogoStatus {
  enabled: boolean;
  eligible: boolean;
  paid: boolean;
  turns_remaining: number;
  refine_remaining: number;
  reason: string | null;
}

export function fetchWizardLogoStatus(token: string): Promise<WizardLogoStatus> {
  return request("/api/v1/onboarding/wizard/logo-status/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** Same response shape as the studio's converse-api.ts `ConverseTurnResponse`. */
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

export function wizardConverse(
  token: string,
  body: {
    stage: "icon" | "name" | "tagline";
    message: string;
    transcript: { role: string; text: string }[];
    pinned: object;
    brief?: { style_chips?: string[] };
  },
): Promise<ConverseTurnResponse> {
  return request("/api/v1/onboarding/wizard/logo-converse/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}

/** `draftToken` is the draft-cache token returned on the prior turn's
 * `ConverseTurnResponse.token` — sent as `draft_token` because the wizard
 * AUTH token already occupies the `token` key; the backend rewrites it
 * before delegating to the shared engine (see wizard_logo.py's
 * `_engine_data`). */
export function wizardConverseFinish(
  token: string,
  draftToken: string,
  images: string[],
): Promise<ConverseTurnResponse> {
  return request("/api/v1/onboarding/wizard/logo-converse/finish/", {
    method: "POST",
    body: JSON.stringify({ token, draft_token: draftToken, images }),
  });
}

/** Same response shape as the studio's refine-api.ts `RefineResponse`. */
export interface RefineResponse {
  design: RefinedDesign | null;
  source: "ai" | "disabled" | "upgrade_required" | "quota_exhausted" | "error";
  refine_remaining: number;
  phase?: "draft" | "final";
  token?: string;
}

export function wizardRefine(
  token: string,
  body: { recipe: object; instruction: string },
): Promise<RefineResponse> {
  return request("/api/v1/onboarding/wizard/logo-refine/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}

export function wizardLogoUpload(
  token: string,
  kind: "logo" | "icon",
  blob: Blob,
): Promise<{ key: string }> {
  const form = new FormData();
  form.append("token", token);
  form.append("kind", kind);
  form.append("file", blob, `${kind}.png`);
  return request("/api/v1/onboarding/wizard/logo-upload/", {
    method: "POST",
    headers: undefined, // let the browser set multipart/form-data + boundary
    body: form,
  });
}

export function wizardCheckout(
  token: string,
  planId: number,
): Promise<{ checkout_url: string }> {
  return request("/api/v1/onboarding/wizard/checkout/", {
    method: "POST",
    body: JSON.stringify({ token, plan_id: planId }),
  });
}

/** A ConverseDesign -> a renderable LogoRecipe, for the full lockup stages
 * (name/tagline). This is the exact accessor the studio's design cards use
 * (studio-chat.tsx: `composeConverseDesign(d, brandName)`) — Task 8 should
 * import ONLY this, not composer.ts directly, so the wizard has one place
 * that knows how a design becomes a recipe. */
export function designRecipe(design: ConverseDesign, brandName: string): LogoRecipe {
  return composeConverseDesign(design, brandName);
}
