import { NextRequest, NextResponse } from "next/server";
import { POST as setSession } from "@shared/auth/login-route";
import { BASE_DOMAIN, DJANGO_API_URL } from "@/lib/constants";

/** Sets the session cookie (shared with the other app), then says who signed in:
 * the callback page lands a creator on `/<preferred_locale>/dashboard`. */
export async function POST(request: NextRequest) {
  const { token } = await request.clone().json();
  const response = await setSession(request);
  if (!response.ok) return response;

  let preferredLocale = "";
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/v1/auth/users/me/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-Domain": BASE_DOMAIN,
      },
    });
    if (res.ok) preferredLocale = (await res.json()).preferred_locale ?? "";
    else console.error("google sign-in: users/me answered", res.status);
  } catch (err) {
    // no language known: the callback falls back to English
    console.error("google sign-in: could not read preferred_locale", err);
  }

  const out = NextResponse.json({
    ok: true,
    user: { preferred_locale: preferredLocale },
  });
  const cookie = response.headers.get("set-cookie");
  if (cookie) out.headers.set("set-cookie", cookie);
  return out;
}
