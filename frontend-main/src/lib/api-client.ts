// Shared same-origin API client for the superadmin platform pages.
// All `/api/v1/platform/*`-style endpoints authenticate via the same-origin
// admin cookie — no bearer tokens, no custom Host handling. Replaces the four
// per-module clientFetch clones (platform-email, platform-logs,
// platform-blog-admin, platform-mailbox) that had drifted apart on 204
// handling and error extraction.
//
// clientFetch does NOT force Content-Type — FormData uploads (mailbox
// attachments) need the browser to set the multipart boundary itself.
// jsonFetch layers Content-Type: application/json on top for JSON bodies.

function extractDetail(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    // DRF error shapes: {detail: "..."} or {field: ["msg", ...]} — prefer
    // detail, else surface the first field error so validation messages
    // (e.g. recipient_filter, subject) reach the toast.
    const detail =
      obj.detail ??
      Object.values(obj).find((v) => typeof v === "string" || Array.isArray(v));
    if (Array.isArray(detail)) return detail.join(" ");
    if (detail) return String(detail);
  }
  return `Request failed (${status})`;
}

export async function clientFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, { ...options, credentials: "same-origin" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(extractDetail(data, res.status));
  }
  if (res.status === 204) return undefined as T;
  // Cloudflare can drop Content-Length on empty success bodies — res.json()
  // would then throw and turn a success into a UI error (same bug class as
  // the 204/broadcast fix in frontend-customer). Parse via text and treat an
  // empty body as no payload.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function jsonFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return clientFetch<T>(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
}
