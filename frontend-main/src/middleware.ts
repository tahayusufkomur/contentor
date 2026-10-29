import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { LOCALE_COOKIE, routing } from "@/i18n/routing";

const intl = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const response = intl(request);
  // The backend answers contentor.app in the cookie's language, else the
  // browser's. next-intl only writes the cookie when it differs from the
  // browser's language, so a page whose language the browser doesn't say would
  // reach the backend in the wrong one. A redirect needs nothing from this:
  // the request it leads to gets it, and next-intl itself updates an outdated
  // cookie on the /en/... redirect the switcher links to.
  if (response.status < 300 || response.status >= 400) {
    const first = request.nextUrl.pathname.split("/")[1];
    const locale = routing.locales.includes(first)
      ? first
      : routing.defaultLocale;
    if (request.cookies.get(LOCALE_COOKIE.name)?.value !== locale) {
      response.cookies.set(LOCALE_COOKIE.name, locale, {
        path: "/",
        sameSite: "lax",
        maxAge: LOCALE_COOKIE.maxAge,
      });
    }
  }
  return response;
}

export const config = {
  // Not the superadmin panel (English only), the API, Next internals or files.
  matcher: ["/((?!admin(?:/|$)|api(?:/|$)|_next|.*\\..*).*)"],
};
