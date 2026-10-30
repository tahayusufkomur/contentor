import { NextRequest, NextResponse } from "next/server";
import { POST as setSession } from "@shared/auth/login-route";
import { resolveLocale } from "@shared/i18n/locales";
import { CREATOR_LOCALE_COOKIE } from "@/i18n/surface";
import { DJANGO_API_URL } from "@/lib/constants";

/** Sets the session cookie (shared with the other app), then, for a creator,
 * the `user-locale` cookie the studio reads: magic-link sign-in gets it from
 * Django's response, this path only hands us a token. */
export async function POST(request: NextRequest) {
  const { token } = await request.clone().json();
  const response = await setSession(request);
  if (!response.ok) return response;

  const host = request.headers.get("x-tenant-domain") ?? request.nextUrl.host;
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/auth/users/me/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-Domain": host.split(":")[0],
      },
      cache: "no-store",
    });
    const me = res.ok ? await res.json() : null;
    if (me && (me.role === "owner" || me.role === "coach")) {
      response.cookies.set(
        CREATOR_LOCALE_COOKIE,
        resolveLocale(me.preferred_locale),
        {
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
        },
      );
    }
  } catch {
    // no language known: the studio falls back to the language on the creator's row
  }
  return response;
}
