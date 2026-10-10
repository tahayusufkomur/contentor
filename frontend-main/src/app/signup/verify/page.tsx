"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, MailPlus, Rocket } from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "@/components/auth/auth-shell";
import { recoverSignup, requestHandoff } from "@/lib/api/onboarding";
import { ApiError } from "@/types/api";

type VerifyState = "verifying" | "preparing" | "expired" | "error";
type ResumeState = "idle" | "sent" | "closed" | "failed";
const TOKEN_KEY = "contentor_wizard_token";

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

/** Verify the email, create the site, then hand the coach straight to their
 * own /setup — the whole onboarding happens there. */
export default function SignupVerifyPage() {
  const t = useTranslations("auth.signup");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>("verifying");
  const [error, setError] = useState("");
  const [domain, setDomain] = useState("");
  const [resumeState, setResumeState] = useState<ResumeState>("idle");
  const resumeToken = useRef<string | null>(null);
  const started = useRef(false);

  const handoff = useCallback(
    async (wizardToken: string) => {
      try {
        const { login_url } = await requestHandoff(wizardToken);
        window.location.assign(login_url);
      } catch {
        setError(t("verify.errors.setupFailed"));
        setState("error");
      }
    },
    [t],
  );

  const waitForSite = useCallback(
    (slug: string, wizardToken: string) => {
      let polls = 0;
      const poll = setInterval(async () => {
        // ~3 minutes: provisioning is seconds; past that, stop and say so —
        // reloading re-verifies, which restarts a provisioning that never ran.
        if (++polls > 120) {
          clearInterval(poll);
          setError(t("verify.errors.slow"));
          setState("error");
          return;
        }
        try {
          const res = await fetch(`/api/v1/onboarding/status/?slug=${slug}`, {
            credentials: "same-origin",
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === "ready") {
            clearInterval(poll);
            void handoff(wizardToken);
          } else if (data.status === "failed") {
            clearInterval(poll);
            setError(t("verify.errors.setupFailed"));
            setState("error");
          }
        } catch {
          // keep polling
        }
      }, 1500);
    },
    [handoff, t],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch {
      // storage unavailable
    }
    const proof = token ?? stored;
    if (!proof) {
      setError(t("verify.errors.noToken"));
      setState("error");
      return;
    }
    resumeToken.current = proof;
    fetch("/api/v1/onboarding/signup/verify/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: proof }),
      credentials: "same-origin",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setState("expired");
          return;
        }
        const wizardToken = (data.wizard_token as string | undefined) ?? proof;
        resumeToken.current = wizardToken;
        try {
          localStorage.setItem(TOKEN_KEY, wizardToken);
        } catch {
          // resume via email link only
        }
        window.history.replaceState(null, "", "/signup/verify");
        setDomain(data.domain);
        setState("preparing");
        if (data.status === "ready") void handoff(wizardToken);
        else waitForSite(data.slug, wizardToken);
      })
      .catch(() => {
        setError(t("verify.errors.network"));
        setState("error");
      });
  }, [token, t, handoff, waitForSite]);

  const { run: resend, loading: resending } = useAsyncAction(
    async () => {
      if (!resumeToken.current) return;
      await recoverSignup(resumeToken.current);
      setResumeState("sent");
    },
    {
      onError: (err) =>
        setResumeState(
          err instanceof ApiError && err.status === 409 ? "closed" : "failed",
        ),
    },
  );

  if (state === "verifying" || state === "preparing") {
    return (
      <AuthShell
        eyebrow={t(
          state === "verifying"
            ? "verify.verifyingEyebrow"
            : "verify.provisioningEyebrow",
        )}
        title={t(
          state === "verifying"
            ? "verify.verifyingTitle"
            : "verify.provisioningTitle",
        )}
        subtitle={t(
          state === "verifying"
            ? "verify.verifyingSubtitle"
            : "verify.provisioningSubtitle",
        )}
      >
        <StateIcon variant="primary">
          {state === "verifying" ? <Spinner /> : <Rocket className="h-6 w-6" />}
        </StateIcon>
        <div className="mt-7 flex items-center justify-center gap-2 text-[14px] text-muted-foreground">
          <Spinner size="sm" />
          <span>
            {t("verify.creating")}{" "}
            <strong className="text-foreground">{domain}</strong>
          </span>
        </div>
      </AuthShell>
    );
  }

  if (state === "expired") {
    const r = (key: string) => t(`verify.resume.${key}`);
    if (resumeState === "sent" || resumeState === "closed") {
      return (
        <AuthShell
          eyebrow={r("eyebrow")}
          title={r(resumeState === "sent" ? "sentTitle" : "closedTitle")}
          subtitle={r(
            resumeState === "sent" ? "sentSubtitle" : "closedSubtitle",
          )}
        >
          <StateIcon variant="success">
            <CheckCircle2 className="h-6 w-6" />
          </StateIcon>
          {resumeState === "closed" && (
            <Button asChild size="lg" className="mt-7 w-full">
              <a href="/login">{r("closedCta")}</a>
            </Button>
          )}
        </AuthShell>
      );
    }
    return (
      <AuthShell
        eyebrow={r("eyebrow")}
        title={r("title")}
        subtitle={resumeState === "failed" ? r("failed") : r("subtitle")}
      >
        <StateIcon
          variant={resumeState === "failed" ? "destructive" : "primary"}
        >
          {resumeState === "failed" ? (
            <AlertCircle className="h-6 w-6" />
          ) : (
            <MailPlus className="h-6 w-6" />
          )}
        </StateIcon>
        {resumeState === "failed" ? (
          <Button asChild variant="outline" size="lg" className="mt-7 w-full">
            <a href="/signup">{r("startOver")}</a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="mt-7 w-full"
            onClick={() => void resend()}
            loading={resending}
            loadingText={r("sending")}
          >
            {r("resend")}
          </Button>
        )}
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
