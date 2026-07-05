"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, AlertCircle, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";

import { QuestionnaireStep } from "./QuestionnaireStep";
import { requestHandoff } from "@/lib/api/onboarding";

type VerifyState =
  | "verifying"
  | "questionnaire"
  | "provisioning"
  | "ready"
  | "error";

function StateIcon({
  variant,
  children,
}: {
  variant: "primary" | "success" | "destructive";
  children: React.ReactNode;
}) {
  const styles: Record<typeof variant, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    destructive: "text-destructive bg-destructive/10",
  };
  return (
    <div
      className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl glass-strong ${styles[variant]}`}
    >
      {children}
    </div>
  );
}

export default function SignupVerifyPage() {
  const t = useTranslations("auth.signup");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>("verifying");
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifiedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = useCallback(
    (tenantSlug: string) => {
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/v1/onboarding/status/?slug=${tenantSlug}`,
            {
              credentials: "same-origin",
            },
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === "ready") {
              if (pollRef.current) clearInterval(pollRef.current);
              setDomain(statusData.domain);
              setState("ready");
            } else if (statusData.status === "failed") {
              if (pollRef.current) clearInterval(pollRef.current);
              setError(t("verify.errors.setupFailed"));
              setState("error");
            }
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    },
    [t],
  );

  const handleQuestionnaireSubmitted = useCallback(() => {
    setState("provisioning");
    startPolling(slug);
  }, [slug, startPolling]);

  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    if (!token) {
      setError(t("verify.errors.noToken"));
      setState("error");
      return;
    }

    fetch("/api/v1/onboarding/signup/verify/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || t("verify.errors.verificationFailed"));
          setState("error");
          return;
        }

        setSlug(data.slug);
        setDomain(data.domain);

        // If the tenant is somehow already provisioned (idempotent re-verify
        // after the user previously submitted the questionnaire), skip ahead.
        if (data.status === "ready") {
          setState("ready");
          return;
        }
        // status === 'provisioning' means the questionnaire was already
        // submitted in a previous session; resume polling.
        if (data.status === "provisioning") {
          setState("provisioning");
          startPolling(data.slug);
          return;
        }

        setState("questionnaire");
      })
      .catch(() => {
        setError(t("verify.errors.network"));
        setState("error");
      });
  }, [token, t, startPolling]);

  // One-click login: when the studio is ready, swap the CTA for an
  // authenticated URL. Falls back to the plain domain link on any failure
  // (e.g. the signup token expired) — the lock screen's owner-login path
  // remains the safety net.
  useEffect(() => {
    if (state !== "ready" || !token || loginUrl) return;
    requestHandoff(token)
      .then((d) => setLoginUrl(d.login_url))
      .catch(() => {});
  }, [state, token, loginUrl]);

  if (state === "verifying") {
    return (
      <AuthShell
        eyebrow={t("verify.verifyingEyebrow")}
        title={t("verify.verifyingTitle")}
        subtitle={t("verify.verifyingSubtitle")}
      >
        <StateIcon variant="primary">
          <Loader2 className="h-6 w-6 animate-spin" />
        </StateIcon>
        <div className="mt-7 flex items-center justify-center">
          <div className="h-1 w-40 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[oklch(0.62_0.24_232)] to-[oklch(0.55_0.24_270)]" />
          </div>
        </div>
      </AuthShell>
    );
  }

  if (state === "questionnaire" && token) {
    return (
      <QuestionnaireStep
        token={token}
        onSubmitted={handleQuestionnaireSubmitted}
      />
    );
  }

  if (state === "provisioning") {
    return (
      <AuthShell
        eyebrow={t("verify.provisioningEyebrow")}
        title={t("verify.provisioningTitle")}
        subtitle={t("verify.provisioningSubtitle")}
      >
        <StateIcon variant="primary">
          <Rocket className="h-6 w-6" />
        </StateIcon>
        <div className="mt-7 flex items-center justify-center gap-2 text-[14px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {t("verify.creating")}{" "}
            <strong className="text-foreground">{domain || slug}</strong>
          </span>
        </div>
      </AuthShell>
    );
  }

  if (state === "ready") {
    return (
      <AuthShell
        eyebrow={t("verify.readyEyebrow")}
        title={t("verify.readyTitle")}
        subtitle={t("verify.readySubtitle")}
      >
        <StateIcon variant="success">
          <CheckCircle2 className="h-6 w-6" />
        </StateIcon>
        <Button asChild variant="brand" size="lg" className="mt-7 w-full">
          <a href={loginUrl ?? `http://${domain}`}>
            {t("verify.openCta", { domain })}
          </a>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("verify.errorEyebrow")}
      title={t("verify.errorTitle")}
      subtitle={error}
    >
      <StateIcon variant="destructive">
        <AlertCircle className="h-6 w-6" />
      </StateIcon>
      <Button asChild variant="outline" size="lg" className="mt-7 w-full">
        <a href="/signup">{t("verify.tryAgain")}</a>
      </Button>
    </AuthShell>
  );
}
