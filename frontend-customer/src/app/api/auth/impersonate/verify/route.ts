import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { DJANGO_API_URL } from "@/lib/constants";

// Redeem an impersonation token: proxy to Django on the tenant domain,
// forwarding any current session cookie (so Django can stash it as the
// "return" cookie) and passing back the new session Set-Cookie.
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  const headersList = await headers();
  const tenantDomain =
    headersList.get("x-tenant-domain") ||
    headersList.get("host") ||
    "localhost";
  const hostOnly = tenantDomain.split(":")[0];

  try {
    const res = await fetch(
      new URL("/api/v1/auth/impersonate/verify/", DJANGO_API_URL).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Domain": hostOnly,
          Cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ token }),
      },
    );

    const data = await res
      .json()
      .catch(() => ({ detail: "Verification service unavailable" }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    const response = NextResponse.json(data);
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) response.headers.set("set-cookie", setCookie);
    return response;
  } catch (err) {
    console.error("Impersonation verify failed to reach Django:", err);
    return NextResponse.json(
      { detail: "Verification service unavailable" },
      { status: 502 },
    );
  }
}
