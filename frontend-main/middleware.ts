import { NextResponse, type NextRequest } from "next/server";

import { resolveHost } from "./src/i18n/config";

// Marketing site middleware: derive region + locale from host header,
// expose via x-region/x-locale request headers (consumed by getRequestConfig
// and any server components that need to know the region).
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const { region, locale } = resolveHost(host);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-region", region);
  requestHeaders.set("x-locale", locale);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next|_static|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
