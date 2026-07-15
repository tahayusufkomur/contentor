/** Wizard API client. Token rides in the BODY (never the URL) — same
 * convention as src/lib/api/onboarding.ts. */

import { ApiError } from "@/types/api";
import type { CuratedLogoItem, WizardAnswers, WizardCatalog, WizardStateResponse } from "./types";

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

export function getWizardCatalog(): Promise<WizardCatalog> {
  return request("/api/v1/onboarding/wizard/catalog/");
}

export function readWizardState(token: string): Promise<WizardStateResponse> {
  return request("/api/v1/onboarding/wizard/state/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export interface PatchWizardBody {
  answers?: WizardAnswers;
  current_step?: string;
  finished_rest_for_me?: boolean;
}

export function patchWizardState(token: string, body: PatchWizardBody): Promise<WizardStateResponse> {
  return request("/api/v1/onboarding/wizard/state/", {
    method: "PATCH",
    body: JSON.stringify({ token, ...body }),
  });
}

export function finalizeWizard(token: string): Promise<{ slug: string; status: string; template_status: string }> {
  return request("/api/v1/onboarding/wizard/finalize/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getDescribeFollowups(
  token: string,
  description: string,
  signal?: AbortSignal,
): Promise<{ questions: string[] }> {
  return request("/api/v1/onboarding/wizard/describe-followups/", {
    method: "POST",
    body: JSON.stringify({ token, description }),
    signal,
  });
}

export function getCuratedLogos(): Promise<CuratedLogoItem[]> {
  return request("/api/v1/logos/curated/");
}

export function recoverWizard(token: string): Promise<{ detail: string }> {
  return request("/api/v1/onboarding/wizard/recover/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
