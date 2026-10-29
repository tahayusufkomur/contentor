import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

const intl = createMiddleware(routing);
const cookie = routing.localeCookie as { name: string; maxAge: number };

export default function middleware(request: NextRequest) {
  const response = intl(request);
  // The backend answers contentor.app in the cookie's language, else the
  // browser's. next-intl only writes the cookie when it differs from the
  // browser's language, so a page whose language the browser doesn't say would
  // reach the backend in the wrong one. A redirect needs nothing: the request
  // it leads to gets this.
  if (response.status < 300 || response.status >= 400) {
    const first = request.nextUrl.pathname.split("/")[1];
    const locale = routing.locales.includes(first)
      ? first
      : routing.defaultLocale;
    if (request.cookies.get(cookie.name)?.value !== locale) {
      response.cookies.set(cookie.name, locale, {
        path: "/",
        sameSite: "lax",
        maxAge: cookie.maxAge,
      });
    }
  }
  return response;
}

export const config = {
  // Not the superadmin panel (English only), the API, Next internals or files.
  matcher: ["/((?!admin(?:/|$)|api(?:/|$)|_next|.*\\..*).*)"],
};
