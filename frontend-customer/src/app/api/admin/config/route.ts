import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, DJANGO_API_URL, BASE_DOMAIN } from "@/lib/constants";
import { configCache } from "@/lib/tenant";

async function proxyConfig(req: NextRequest, method: string, body?: unknown) {
  const cookieStore = await cookies();
  const headersList = await headers();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const slug = headersList.get("x-tenant-slug") || "unknown";
  const tenantDomain = `${slug}.${BASE_DOMAIN}`;

  const res = await fetch(`${DJANGO_API_URL}/api/v1/admin/config/`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Domain": tenantDomain,
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET() {
  return proxyConfig(null as unknown as NextRequest, "GET");
}

export async function PATCH(req: NextRequest) {
  const headersList = await headers();
  const slug = headersList.get("x-tenant-slug") || "unknown";
  const body = await req.json();
  const response = await proxyConfig(req, "PATCH", body);
  // Bust the in-memory config cache so router.refresh() re-renders the
  // previewed page with the just-saved blocks. fetchTenantConfig keys by the
  // live tenant domain (not slug), so clear all entries to avoid a stale
  // preview during editing.
  void slug;
  configCache.clear();
  return response;
}
