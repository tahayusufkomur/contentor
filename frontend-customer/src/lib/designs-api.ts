// The photo studio's designs: what she can put a cover on, her drafts and kept covers, Keep, and Download
// (backend/apps/media/design_views.py). Nothing changes on a course or event until keepDesign.
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import type {
  CoverRecipe,
  CoverSize,
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

/** Three options for one of the cover's words, from the item's facts. 503 when the model is not on. */
export async function suggestWords(
  id: string,
  part: "label" | "title" | "subtitle",
): Promise<string[]> {
  const { options } = await clientFetch<{ options: string[] }>(
    `${BASE}/${id}/words/`,
    { method: "POST", body: JSON.stringify({ part }) },
  );
  return options;
}

/** Four styles for the cover on its own photo, as recipes; `shown` are the layouts she has seen, so the
 *  next four are others. */
export async function fourStyles(
  id: string,
  shown: string[],
): Promise<CoverRecipe[]> {
  const { styles } = await clientFetch<{ styles: CoverRecipe[] }>(
    `${BASE}/${id}/styles/`,
    { method: "POST", body: JSON.stringify({ shown }) },
  );
  return styles;
}

/** Downloads the design, as it is saved, at `size` as a PNG or JPEG file: the browser saves it under the
 *  name the server gives it ("<title>-<size>.png"). */
export async function downloadDesign(
  id: string,
  size: CoverSize,
  format: "png" | "jpeg",
): Promise<void> {
  const res = await fetch(`${BASE}/${id}/export/`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size, format }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new ApiError(res.status, data);
  }
  const file = URL.createObjectURL(await res.blob());
  const name =
    /filename="([^"]+)"/.exec(
      res.headers.get("Content-Disposition") ?? "",
    )?.[1] ?? `cover-${size}.${format === "jpeg" ? "jpg" : "png"}`;
  const link = document.createElement("a");
  link.href = file;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // after the browser has taken the file
  setTimeout(() => URL.revokeObjectURL(file), 10_000);
}
