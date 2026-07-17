import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { BASE_DOMAIN, COOKIE_NAME, DJANGO_API_URL } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token)
    return NextResponse.json({ detail: "unauthorized" }, { status: 401 });

  const res = await fetch(
    `${DJANGO_API_URL}/api/v1/me/tenants/${params.slug}/domain/`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-Domain": BASE_DOMAIN,
      },
      cache: "no-store",
    },
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
