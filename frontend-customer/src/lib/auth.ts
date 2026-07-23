import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, DJANGO_API_URL } from "@/lib/constants";
import { headers } from "next/headers";
import { createTtlPromiseCache } from "@/lib/ttl-promise-cache";
import type { User } from "@/types/auth";

// Every server-rendered navigation blocks on this lookup before streaming, so
// cache it briefly. Role/permission changes take up to the TTL to propagate;
// logout is unaffected (the cookie disappears, so the key is never hit again).
const userCache = createTtlPromiseCache<User>({ ttlMs: 60_000 });

async function fetchAuthUser(
  token: string,
  tenantDomain: string | null,
): Promise<User | null> {
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/auth/users/me/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(tenantDomain && { "X-Tenant-Domain": tenantDomain }),
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const headersList = await headers();
  const tenantDomain = headersList.get("x-tenant-domain");

  return userCache.get(`${tenantDomain ?? ""}:${token}`, () =>
    fetchAuthUser(token, tenantDomain),
  );
}

export async function requireAuth(): Promise<User> {
  const user = await getAuthUser();
  if (!user) redirect("/login?toast=Please+log+in+to+continue&toast_type=info");
  return user;
}

export async function requireRole(user: User, roles: string[]): Promise<void> {
  if (!roles.includes(user.role)) {
    redirect("/");
  }
}
