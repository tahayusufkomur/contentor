"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "next-intl";
import { tEnglish } from "@/lib/english-copy";
import {
  scopeOfToken,
  type ImpersonationScope,
} from "@/lib/impersonation-scope";

export const dynamic = "force-dynamic";

// Landing page for an impersonation hand-off. Redeems the one-time token in
// the query string for a session cookie on this tenant domain, then forwards
// to the target area (?next, default the student home). Who reads it depends
// on the token's scope: a superadmin (platform) gets English whatever the
// site's language; a creator opening a student's view (studio) gets the site's
// language, like the banner that follows. An unreadable token stays English.
export default function ImpersonatePage() {
  const tSite = useTranslations("common");
  const [scope, setScope] = useState<ImpersonationScope | null | undefined>();
  const [error, setError] = useState("");
  const t = scope === "studio" ? tSite : tEnglish;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const next = params.get("next") || "/";
    const tokenScope = scopeOfToken(token);
    setScope(tokenScope);
    const say = tokenScope === "studio" ? tSite : tEnglish;
    if (!token) {
      setError(say("impersonation.missingToken"));
      return;
    }
    fetch("/api/auth/impersonate/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || say("impersonation.invalidLink"));
        }
        // Full reload so server components pick up the new session cookie.
        window.location.replace(next);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The text waits for the scope (one effect tick) so it never flips language.
  if (scope === undefined) return null;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-foreground">
              {t("impersonation.startFailed")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Spinner size="lg" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t("impersonation.opening")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
