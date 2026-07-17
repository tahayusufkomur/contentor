"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const source = searchParams.get("source");
    if (!token) {
      setError("No token provided");
      return;
    }

    // Google OAuth callback: token is already a session JWT, just set the cookie
    if (source === "google") {
      fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "same-origin",
      })
        .then(async (res) => {
          if (!res.ok) {
            setError("Authentication failed");
            return;
          }
          router.push("/?toast=Welcome+back!&toast_type=success");
        })
        .catch(() => setError("Network error"));
      return;
    }

    // Magic link callback: token needs Django verification
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setError(data.detail || "Verification failed");
          return;
        }
        const data = await res.json();
        // Honor ?next= when it's a same-site relative path — the onboarding
        // handoff sends next=/ so a fresh coach lands on their new homepage,
        // not the admin. Absolute/protocol-relative values are dropped.
        const rawNext = searchParams.get("next");
        const next =
          rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
            ? rawNext
            : null;
        const role = data.user?.role;
        const dest =
          next ?? (role === "owner" || role === "coach" ? "/admin" : "/");
        router.push(
          `${dest}${dest.includes("?") ? "&" : "?"}toast=Welcome+back!&toast_type=success`,
        );
      })
      .catch(() => setError("Network error"));
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p>Verifying...</p>
    </div>
  );
}
