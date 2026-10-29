"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "@/components/auth/auth-shell";
import { useLocaleNavigate } from "@/i18n/navigation";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { resolveLocale } from "@shared/i18n/locales";
import { localizedHref } from "@/lib/locale-href";

export default function CallbackPage() {
  const t = useTranslations("auth.callback");
  const navigate = useLocaleNavigate();
  const goTo = useNavigate();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const source = searchParams.get("source");
    if (!token) {
      setError(t("noToken"));
      return;
    }

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
          navigate("/dashboard");
        })
        .catch(() => setError(t("networkError")));
      return;
    }

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
        // A creator lands on their dashboard in their own language.
        const { user } = await res.json();
        goTo(
          localizedHref("/dashboard", resolveLocale(user?.preferred_locale)),
        );
      })
      .catch(() => setError(t("networkError")));
  }, [searchParams, navigate, goTo, t]);

  if (error) {
    return (
      <AuthShell
        eyebrow={t("errorEyebrow")}
        title={t("somethingWrong")}
        subtitle={error}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-destructive">
          <AlertCircle className="h-6 w-6" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("oneMoment")}
      title={t("verifyingTitle")}
      subtitle={t("verifyingSubtitle")}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-primary">
        <Spinner />
      </div>
    </AuthShell>
  );
}
