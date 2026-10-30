"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { tEnglish as t } from "@/lib/english-copy";

export const dynamic = "force-dynamic";

// Landing page for an impersonation hand-off. Redeems the one-time token in
// the query string for a session cookie on this tenant domain, then forwards
// to the target area (?next, default the student home). A superadmin reads it,
// so it stays English whatever the site's language.
export default function ImpersonatePage() {
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const next = params.get("next") || "/";
    if (!token) {
      setError(t("impersonation.missingToken"));
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
          throw new Error(data.detail || t("impersonation.invalidLink"));
        }
        // Full reload so server components pick up the new session cookie.
        window.location.replace(next);
      })
      .catch((err) => setError(err.message));
  }, []);

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
