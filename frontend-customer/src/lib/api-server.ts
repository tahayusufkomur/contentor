import { cookies, headers } from "next/headers";
import { COOKIE_NAME, DJANGO_API_URL } from "@/lib/constants";
import { ApiError } from "@/types/api";

export async function serverFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const cookieStore = await cookies();
  const headersList = await headers();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const tenantDomain = headersList.get("x-tenant-domain");

  const res = await fetch(`${DJANGO_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(tenantDomain && { "X-Tenant-Domain": tenantDomain }),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    // Guard: an error response may have an empty body — don't let res.json()
    // throw a parse error that masks the real status.
    const data = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new ApiError(res.status, data);
  }

  // Guard: a 204 / empty success body (Cloudflare can strip Content-Length) —
  // res.json() would throw on the empty stream.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json();
}
