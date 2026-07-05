"use client";

import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

// Landing page for an impersonation hand-off. Redeems the one-time token in
// the query string for a session cookie on this tenant domain, then forwards
// to the target area (?next, default the student home).
export default function ImpersonatePage() {
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const next = params.get("next") || "/";
    if (!token) {
      setError("Missing impersonation token.");
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
          throw new Error(
            data.detail || "This impersonation link is invalid or expired.",
          );
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
              Couldn’t start the session
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Opening session…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
