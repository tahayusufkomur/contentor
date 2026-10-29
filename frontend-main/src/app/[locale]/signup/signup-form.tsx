"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { LocaleNavLink, useLocaleNavigate } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlatformAuthenticated } from "@/lib/api/onboarding";
import { SignupFrame, SignupShell, SlideHeader } from "./signup-shell";

interface SignupFormProps {
  /** Set when an already-logged-in coach is creating an additional platform. */
  authenticatedName?: string | null;
}

export function SignupForm({ authenticatedName }: SignupFormProps) {
  if (authenticatedName) {
    return <AuthenticatedSignupForm authenticatedName={authenticatedName} />;
  }
  return <AnonymousSignupFlow />;
}

/** Already-logged-in coach creating an additional platform: one tap mints the
 * signup token (no email round-trip) and moves to /signup/verify. The new site
 * is named, and its bio added, in its own /setup. */
function AuthenticatedSignupForm({
  authenticatedName,
}: {
  authenticatedName: string;
}) {
  const t = useTranslations("auth.signup");
  const navigate = useLocaleNavigate();
  const [error, setError] = useState<string | null>(null);

  const { run: create, loading } = useAsyncAction(
    async () => {
      setError(null);
      const { token } = await createPlatformAuthenticated();
      navigate(`/signup/verify?token=${encodeURIComponent(token)}`);
    },
    { onError: () => setError(t("errors.generic")) },
  );

  return (
    <SignupShell
      stepId="create"
      direction={1}
      progress={50}
      canBack
      onBack={() => navigate("/dashboard")}
      error={error}
      footer={
        <Button
          type="button"
          variant="brand"
          size="lg"
          className="w-full max-w-[340px]"
          loading={loading}
          loadingText={t("authSubmitting")}
          onClick={() => void create()}
        >
          {t("authSubmit")}
        </Button>
      }
    >
      <SlideHeader
        heading={t("authTitle")}
        subhead={t("authSubtitle", { name: authenticatedName })}
      />
    </SignupShell>
  );
}

type Step = "contact" | "email-sent";

const DRAFT_KEY = "contentor_signup_draft";
const RESEND_COOLDOWN_SECONDS = 30; // the endpoint allows 5/min per IP

/** New coach: name+email -> verification email sent. The rest of onboarding,
 * the site's name and bio first, happens in the coach's own /setup after the
 * email link. */
function AnonymousSignupFlow() {
  const t = useTranslations("auth.signup");
  const [step, setStep] = useState<Step>("contact");
  const [direction, setDirection] = useState(1);
  // The temporary address the first email's link creates: a resend keeps it.
  const [site, setSite] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [restored, setRestored] = useState(false);

  // A reload (or a password manager's autofill hiccup) must not wipe the form:
  // keep {name, email, site, step} for this tab only.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.site === "string") setSite(d.site);
        if (typeof d.name === "string") setName(d.name);
        if (typeof d.email === "string") setEmail(d.email);
        if (d.step === "email-sent") setStep(d.step);
      }
    } catch {
      // storage unavailable or corrupt — start fresh
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return; // never overwrite the saved draft with the empty initial state
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ site, name, email, step }),
      );
    } catch {
      // private mode — the draft just isn't kept
    }
  }, [restored, site, name, email, step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const { run: handleContactSubmit, loading: contactLoading } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const res = await fetch("/api/v1/onboarding/signup/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, site }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || t("errors.generic"));
        return;
      }
      setSite(data.site ?? "");
      setStep("email-sent");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
    { onError: () => setError(t("errors.generic")) },
  );

  const { run: handleResend, loading: resending } = useAsyncAction(
    async () => {
      const res = await fetch("/api/v1/onboarding/signup/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, site }),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("resend failed");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success(t("resent"));
    },
    { errorToast: t("errors.generic") },
  );

  if (step === "email-sent") {
    return (
      <SignupFrame
        title={t("verifyTitle")}
        subtitle={t("verifyDescription", { email })}
        progress={90}
        onBack={() => {
          setDirection(-1);
          setStep("contact");
        }}
      >
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-6 text-[13px] text-muted-foreground">
            {t("spamHint")}
          </p>
          <div className="mt-5 flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              loading={resending}
              disabled={cooldown > 0}
              onClick={handleResend}
            >
              {cooldown > 0
                ? t("resendIn", { seconds: cooldown })
                : t("resend")}
            </Button>
            <button
              type="button"
              className="text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setDirection(-1);
                setStep("contact");
              }}
            >
              {t("useDifferentEmail")}
            </button>
          </div>
        </div>
      </SignupFrame>
    );
  }

  const signInLink = (
    <p className="text-center text-[13px] text-muted-foreground">
      {t("alreadyHaveAccount")}{" "}
      <LocaleNavLink
        href="/login"
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {t("signIn")}
      </LocaleNavLink>
    </p>
  );

  // step === "contact"
  return (
    <SignupShell
      stepId="contact"
      direction={direction}
      progress={50}
      canBack={false}
      onBack={() => {}}
      error={error}
      footer={
        <>
          <Button
            type="submit"
            form="contact-form"
            variant="brand"
            size="lg"
            className="w-full max-w-[340px]"
            loading={contactLoading}
            loadingText={t("submitting")}
          >
            {t("submit")}
          </Button>
          {signInLink}
        </>
      }
    >
      <div>
        <SlideHeader
          heading={t("contactStepHeading")}
          subhead={t("contactStepSubhead")}
        />
        <form
          id="contact-form"
          onSubmit={handleContactSubmit}
          className="mx-auto mt-5 max-w-[380px] space-y-5"
        >
          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-[13px] font-medium text-foreground/80"
            >
              {t("nameLabel")}
            </Label>
            <Input
              id="name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-[13px] font-medium text-foreground/80"
            >
              {t("emailLabel")}
            </Label>
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </form>
      </div>
    </SignupShell>
  );
}
