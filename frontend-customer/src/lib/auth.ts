import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, DJANGO_API_URL } from "@/lib/constants";
import { headers } from "next/headers";
import type { User } from "@/types/auth";

const userCache = new Map<string, { promise: Promise<User | null>; exp: number }>();

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

  const key = `${tenantDomain ?? ""}:${token}`;
  const hit = userCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.promise;

  const promise = fetchAuthUser(token, tenantDomain).catch((err) => {
    userCache.delete(key);
    throw err;
  });
  userCache.set(key, { promise, exp: Date.now() + 60_000 });
  return promise;
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
