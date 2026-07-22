import { NextRequest, NextResponse } from "next/server";

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const host = hostname.split(":")[0];

  const headers = new Headers(request.headers);

  // Customer app always runs on a tenant subdomain or custom domain
  if (host.endsWith(`.${BASE_DOMAIN}`)) {
    const slug = host.split(".")[0];
    headers.set("x-tenant-slug", slug);
  } else {
    // Custom domain or dev environment
    headers.set("x-tenant-slug", host);
  }

  headers.set("x-tenant-domain", hostname);
  // Expose the path so the root layout can let auth routes bypass the publish gate.
  headers.set("x-pathname", request.nextUrl.pathname);

  // Dev override
  if (process.env.NODE_ENV === "development") {
    const devTenant = request.headers.get("x-dev-tenant");
    if (devTenant) {
      headers.set("x-tenant-slug", devTenant);
    }
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Exclude ALL Next internals (`_next`), not just static/image — the previous
  // list missed `_next/webpack-hmr`, so middleware ran on the dev HMR websocket
  // and Caddy logged a steady stream of `502 malformed HTTP response
  // "Unauthorized"`. App-router RSC requests hit real route paths (`?_rsc=`),
  // not `/_next/*`, so they still get the tenant headers.
  matcher: ["/((?!_next|favicon.ico|icons|sw.js).*)"],
};
