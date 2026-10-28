"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { useTenant } from "@/hooks/use-tenant";

export default function CallbackPage() {
  const t = useTranslations("student.callback");
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const brand = useTenant()?.brand_name;
  const [error, setError] = useState("");
  // The token is single-use: a new `t` (messages refreshed) must not rerun the effect.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const t = tRef.current;
    const token = searchParams.get("token");
    const source = searchParams.get("source");
    if (!token) {
      setError(t("noToken"));
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
            setError(t("authFailed"));
            return;
          }
          navigate(
            `/?toast=${encodeURIComponent(t("welcomeBack"))}&toast_type=success`,
          );
        })
        .catch(() => setError(t("networkError")));
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
          setError(data.detail || t("verificationFailed"));
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
        // A first visit is greeted as one; "Welcome back!" on day one read as a bug.
        const greeting =
          data.created === true
            ? brand
              ? t("welcomeTo", { brand })
              : t("welcomeToYourSite")
            : t("welcomeBack");
        navigate(
          `${dest}${dest.includes("?") ? "&" : "?"}toast=${encodeURIComponent(greeting)}&toast_type=success`,
        );
      })
      .catch(() => setError(t("networkError")));
  }, [searchParams, navigate, brand]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p>{t("verifying")}</p>
    </div>
  );
}
