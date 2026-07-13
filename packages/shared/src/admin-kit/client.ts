// Shared admin-kit (schema-driven admin renderer).
// Canonical shared module — imported via @shared/admin-kit/* by both frontend-main and frontend-customer.
//
// Editor note: if your local (non-Docker) tsserver shows false-positive
// "cannot find module 'react'" errors here, that's expected — bare-specifier
// resolution for packages/shared only works inside Docker containers (see the
// node_modules symlink in frontend-main/Dockerfile and frontend-customer/Dockerfile).
// Not a real build error.

import type {
  ActionResult,
  ChoiceOption,
  ListPage,
  ListParams,
  ModelMeta,
  Row,
  SiteMeta,
} from "./types";

/** DRF error: 400 bodies carry per-field message arrays; everything else a detail. */
export class AdminKitError extends Error {
  status: number;
  fieldErrors: Record<string, string>;
  detail: string;

  constructor(status: number, data: unknown) {
    const fieldErrors: Record<string, string> = {};
    let detail = "";
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        const message = Array.isArray(value) ? value.join(" ") : String(value);
        if (key === "detail" || key === "non_field_errors") detail = message;
        else fieldErrors[key] = message;
      }
    }
    if (!detail && Object.keys(fieldErrors).length === 0)
      detail = `Request failed (${status})`;
    super(detail || "Validation failed");
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.detail = detail;
  }
}

async function kitFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new AdminKitError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** All calls for one admin site (e.g. `/api/v1/studio-admin`). */
export function createAdminClient(apiBase: string) {
  const base = apiBase.replace(/\/$/, "");
  return {
    siteMeta: () => kitFetch<SiteMeta>(`${base}/meta/`),

    modelMeta: (model: string) => kitFetch<ModelMeta>(`${base}/${model}/meta/`),

    list: (model: string, params: ListParams) => {
      const search = new URLSearchParams();
      if (params.page && params.page > 1)
        search.set("page", String(params.page));
      if (params.page_size) search.set("page_size", String(params.page_size));
      if (params.q) search.set("q", params.q);
      if (params.ordering) search.set("ordering", params.ordering);
      for (const [key, value] of Object.entries(params.filters ?? {})) {
        if (value !== "") search.set(key, value);
      }
      const qs = search.toString();
      return kitFetch<ListPage>(`${base}/${model}/${qs ? `?${qs}` : ""}`);
    },

    retrieve: (model: string, pk: number | string) =>
      kitFetch<Row>(`${base}/${model}/${pk}/`),

    create: (model: string, data: Record<string, unknown>) =>
      kitFetch<Row>(`${base}/${model}/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (
      model: string,
      pk: number | string,
      data: Record<string, unknown>,
    ) =>
      kitFetch<Row>(`${base}/${model}/${pk}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    destroy: (model: string, pk: number | string) =>
      kitFetch<void>(`${base}/${model}/${pk}/`, { method: "DELETE" }),

    runAction: (model: string, action: string, ids: Array<number | string>) =>
      kitFetch<ActionResult>(`${base}/${model}/actions/${action}/`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),

    autocomplete: (model: string, field: string, q = "") =>
      kitFetch<{ results: ChoiceOption[] }>(
        `${base}/${model}/autocomplete/${field}/${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      ),
  };
}

export type AdminClient = ReturnType<typeof createAdminClient>;
