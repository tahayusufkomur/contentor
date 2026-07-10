// Thin client for the Logo Studio AI Brand Pack endpoints (paid-tier
// feature). See backend/apps/tenant_config/views.py logo_brand_pack /
// logo_brand_pack_status.
import { clientFetch } from "@/lib/api-client";
import type { Brief, BrandPack } from "@/lib/logo/composer";

export interface BrandPackStatus {
  enabled: boolean;
  eligible: boolean;
  remaining: number;
  reason: "upgrade_required" | "quota_exhausted" | "disabled" | null;
  refine_remaining: number;
}

export type BrandPackSource =
  | "ai"
  | "cache"
  | "disabled"
  | "upgrade_required"
  | "quota_exhausted"
  | "error";

export interface BrandPackResponse {
  pack: BrandPack | null;
  source: BrandPackSource;
  remaining: number;
}

export function fetchBrandPackStatus(): Promise<BrandPackStatus> {
  return clientFetch<BrandPackStatus>(
    "/api/v1/admin/config/logo-brand-pack/status/",
  );
}

export function fetchBrandPack(brief: Brief): Promise<BrandPackResponse> {
  return clientFetch<BrandPackResponse>(
    "/api/v1/admin/config/logo-brand-pack/",
    {
      method: "POST",
      body: JSON.stringify({
        niche: brief.niche,
        style_chips: brief.styleChips,
        vibe: brief.vibe ?? "",
      }),
    },
  );
}
