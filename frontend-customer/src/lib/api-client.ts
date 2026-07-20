import { toast } from "sonner";

import { BASE_DOMAIN } from "@/lib/constants";
import { ApiError } from "@/types/api";
import { getSessionId, SESSION_HEADER } from "@shared/tracking/session";

interface DemoReadonlyPayload {
  detail: "demo_readonly";
  message?: string;
  niche?: string;
  tenant_name?: string;
}

function isDemoReadonly(data: unknown): data is DemoReadonlyPayload {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { detail?: string }).detail === "demo_readonly"
  );
}

let demoToastShownAt = 0;

function showDemoReadonlyToast(data: DemoReadonlyPayload) {
  // Debounce: a single user action can fire multiple requests (eg. save +
  // optimistic refresh). One toast per ~3s is plenty.
  const now = Date.now();
  if (now - demoToastShownAt < 3000) return;
  demoToastShownAt = now;

  const apex = BASE_DOMAIN.replace(/^demo-[^.]+\./, "");
  const niche = data.niche || "";
  const signupHref = `//${apex}/signup${niche ? `?template=${encodeURIComponent(niche)}` : ""}`;

  toast.info(data.message || "This is a demo — sign up to keep your changes.", {
    action: {
      label: "Sign up",
      onClick: () => {
        window.location.href = signupHref;
      },
    },
  });
}

export async function clientFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const sid = getSessionId();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(sid ? { [SESSION_HEADER]: sid } : {}),
      ...options?.headers,
    },
    credentials: "same-origin",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Request failed" }));
    if (res.status === 403 && isDemoReadonly(data)) {
      showDemoReadonlyToast(data);
    }
    const retryAfter = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      res.status,
      data,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json();
}

/** Rate limiting (429), server errors (5xx), and network failures (fetch
 * rejects with TypeError) are worth one quick retry; every other failure is a
 * deliberate API outcome the caller must interpret. */
export function isTransientApiError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 429 || err.status >= 500;
  return err instanceof TypeError;
}

/** Run `fn`, retrying transient failures (see isTransientApiError) a limited
 * number of times. Honors the server's Retry-After hint but caps the wait —
 * the tenant rate limiter hints 60s, and a page gate must fail over to its
 * error state rather than hang that long. Non-transient errors rethrow
 * untouched, first try. */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  {
    retries = 1,
    baseDelayMs = 800,
    maxDelayMs = 3_000,
  }: { retries?: number; baseDelayMs?: number; maxDelayMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isTransientApiError(err)) throw err;
      const hintedMs =
        err instanceof ApiError && err.retryAfter
          ? err.retryAfter * 1000
          : baseDelayMs;
      await new Promise((r) => setTimeout(r, Math.min(hintedMs, maxDelayMs)));
    }
  }
}

/**
 * Execute async tasks in batches to avoid rate limiting.
 * Runs `batchSize` tasks concurrently, then waits `delayMs` before next batch.
 */
export async function batchedAsync<T>(
  tasks: (() => Promise<T>)[],
  batchSize = 8,
  delayMs = 200,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
    if (i + batchSize < tasks.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}
