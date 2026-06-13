import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { DJANGO_API_URL } from "@/lib/constants";

const PREVIEW_COOKIE = "contentor_preview";

export async function POST(req: NextRequest) {
  const headersList = await headers();
  const tenantDomain = headersList.get("x-tenant-domain") || "";
  const slug = headersList.get("x-tenant-slug") || "";
  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${DJANGO_API_URL}/api/v1/preview/unlock/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Domain": tenantDomain },
    body: JSON.stringify({ password: body?.password ?? "" }),
  });

  if (!res.ok) {
    return NextResponse.json({ detail: "invalid" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(PREVIEW_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return NextResponse.json({ detail: "ok" });
}
