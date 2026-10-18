// The photo studio's designs: what she can put a cover on, her drafts and kept covers, and Keep
// (backend/apps/media/design_views.py). Nothing changes on a course or event until keepDesign.
import { clientFetch } from "@/lib/api-client";
import type {
  CoverRecipe,
  DesignRecord,
  DesignTargets,
  KeepResponse,
} from "@/types/design";

const BASE = "/api/v1/designs";

export function getTargets(): Promise<DesignTargets> {
  return clientFetch<DesignTargets>(`${BASE}/targets/`);
}

/** Her drafts and kept designs, or only one of them. */
export function listDesigns(state?: "draft" | "kept"): Promise<DesignRecord[]> {
  return clientFetch<DesignRecord[]>(
    `${BASE}/${state ? `?state=${state}` : ""}`,
  );
}

export function getDesign(id: string): Promise<DesignRecord> {
  return clientFetch<DesignRecord>(`${BASE}/${id}/`);
}

/** The target's draft, started if it has none: from `recipe`, from a copy of design `from`, or else on
 *  the photo the target wears now. A draft she already has comes back as it is. */
export function openDesign(body: {
  target_kind: string;
  target_key: string;
  recipe?: CoverRecipe;
  from?: string;
}): Promise<DesignRecord> {
  return clientFetch<DesignRecord>(`${BASE}/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Saves a draft: the whole recipe replaces the stored one. The record comes back with the recipe as
 *  the server kept it (ranges clamped). A kept design cannot be saved: edit a copy. */
export function saveDesign(
  id: string,
  recipe: CoverRecipe,
): Promise<DesignRecord> {
  return clientFetch<DesignRecord>(`${BASE}/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ recipe }),
  });
}

export function deleteDesign(id: string): Promise<void> {
  return clientFetch<void>(`${BASE}/${id}/`, { method: "DELETE" });
}

/** Makes a draft the cover of its course or event series. `audit_id` is the History row that undoes it
 *  (`undoCopilotAction` in lib/copilot/api.ts). */
export function keepDesign(id: string): Promise<KeepResponse> {
  return clientFetch<KeepResponse>(`${BASE}/${id}/keep/`, { method: "POST" });
}
