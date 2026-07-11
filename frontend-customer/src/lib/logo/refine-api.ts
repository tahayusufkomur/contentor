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
