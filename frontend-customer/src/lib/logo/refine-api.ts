// Thin client for the Logo Studio AI refinement endpoint (paid-tier
// feature). See backend/apps/tenant_config/views.py logo_refine.
import { clientFetch } from "@/lib/api-client";
import type { BrandPackElement, RefinedDesign } from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";

export type RefineSource =
  | "ai"
  | "disabled"
  | "upgrade_required"
  | "quota_exhausted"
  | "error";

export interface RefineResponse {
  design: RefinedDesign | null;
  source: RefineSource;
  refine_remaining: number;
  /** Two-pass (Task 12): a "draft" response carries a first-pass design plus a
   * `token`; the client renders it and posts the PNGs back to the finish
   * endpoint for the critiqued "final". Absent (or "final") on a single-pass
   * backend — treat that as the final result. */
  phase?: "draft" | "final";
  token?: string;
}

export function fetchLogoRefine(
  recipe: LogoRecipe,
  elements: BrandPackElement[] | null,
  instruction: string,
): Promise<RefineResponse> {
  return clientFetch<RefineResponse>("/api/v1/admin/config/logo-refine/", {
    method: "POST",
    body: JSON.stringify({ recipe, elements, instruction }),
  });
}

/** Second pass of the refine two-pass: hand the draft's rendered PNGs back so
 * the AI critiques its own work and returns the polished `design`. Mirrors
 * fetchConverseFinish, but the refine finish returns a single `design` (not a
 * list of `designs`). */
export function fetchRefineFinish(
  token: string,
  images: string[],
): Promise<RefineResponse> {
  return clientFetch<RefineResponse>(
    "/api/v1/admin/config/logo-refine/finish/",
    {
      method: "POST",
      body: JSON.stringify({ token, images }),
    },
  );
}
