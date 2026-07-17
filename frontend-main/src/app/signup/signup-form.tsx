"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  checkBrandName,
  createPlatformAuthenticated,
} from "@/lib/api/onboarding";
import { SlideHeader } from "./verify/wizard/steps";
import { WizardShell } from "./verify/wizard/WizardShell";
import { ApiError } from "@/types/api";

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

/** Already-logged-in coach creating an additional platform — unchanged from
 * before this feature: single brand-name field, no email verification. */
function AuthenticatedSignupForm({
  authenticatedName,
}: {
  authenticatedName: string;
}) {
  const t = useTranslations("auth.signup");
  const router = useRouter();
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await createPlatformAuthenticated(brandName);
      router.push(`/signup/verify?token=${encodeURIComponent(token)}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.data?.detail as string | undefined) ?? t("errors.generic"))
          : t("errors.generic"),
      );
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t("authTitle")}
      title={t("authTitle")}
      subtitle={t("authSubtitle", { name: authenticatedName })}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label
            htmlFor="brandName"
            className="text-[13px] font-medium text-foreground/80"
          >
            {t("brandNameLabel")}
          </Label>
          <Input
            id="brandName"
            placeholder={t("brandNamePlaceholder")}
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            required
          />
        </div>
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5">
            <p className="text-[13px] text-destructive">{error}</p>
          </div>
        )}
        <Button
          type="submit"
          variant="brand"
          size="lg"
          className="w-full"
          loading={loading}
        >
          {loading ? t("authSubmitting") : t("authSubmit")}
        </Button>
      </form>
    </AuthShell>
  );
}

type Step = "brand" | "contact" | "email-sent";

/** New coach: brand name -> name+email -> verification email sent. Renders
 * inside the wizard's own shell so this feels like the wizard's first step
 * instead of a separate form. */
function AnonymousSignupFlow() {
  const t = useTranslations("auth.signup");
  const [step, setStep] = useState<Step>("brand");
  const [direction, setDirection] = useState(1);
  const [brandName, setBrandName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBrandContinue() {
    const trimmed = brandName.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await checkBrandName(trimmed);
      if (!result.available) {
        setError(result.detail ?? t("errors.generic"));
        return;
      }
      setDirection(1);
      setStep("contact");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/onboarding/signup/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandName, name, email }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || t("errors.generic"));
        return;
      }
      setStep("email-sent");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  if (step === "email-sent") {
    return (
      <AuthShell
        eyebrow={t("verifyTitle")}
        title={t("verifyTitle")}
        subtitle={t("verifyDescription", { email })}
      >
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl glass-strong">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            <strong className="text-foreground">{brandName}</strong>
          </p>
        </div>
      </AuthShell>
    );
  }

  const signInLink = (
    <p className="text-center text-[13px] text-muted-foreground">
      {t("alreadyHaveAccount")}{" "}
      <Link
        href="/login"
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {t("signIn")}
      </Link>
    </p>
  );

  if (step === "brand") {
    return (
      <WizardShell
        chapter="business"
        stepId="brand"
        direction={direction}
        progress={0}
        canBack={false}
        onBack={() => {}}
        showFinishRest={false}
        onFinishRest={() => {}}
        error={error}
        footer={
          <>
            <Button
              type="button"
              variant="brand"
              size="lg"
              className="w-full max-w-[340px]"
              loading={loading}
              disabled={!brandName.trim()}
              onClick={handleBrandContinue}
            >
              {t("submit")}
            </Button>
            {signInLink}
          </>
        }
      >
        <div>
          <SlideHeader
            heading={t("brandStepHeading")}
            subhead={t("brandStepSubhead")}
          />
          <div className="mx-auto mt-5 max-w-[380px] space-y-2">
            <Label
              htmlFor="brandName"
              className="text-[13px] font-medium text-foreground/80"
            >
              {t("brandNameLabel")}
            </Label>
            <Input
              id="brandName"
              placeholder={t("brandNamePlaceholder")}
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </WizardShell>
    );
  }

  // step === "contact"
  return (
    <WizardShell
      chapter="business"
      stepId="contact"
      direction={direction}
      progress={8}
      canBack
      onBack={() => {
        setError(null);
        setDirection(-1);
        setStep("brand");
      }}
      showFinishRest={false}
      onFinishRest={() => {}}
      error={error}
      footer={
        <>
          <Button
            type="submit"
            form="contact-form"
            variant="brand"
            size="lg"
            className="w-full max-w-[340px]"
            loading={loading}
          >
            {loading ? t("submitting") : t("submit")}
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
    </WizardShell>
  );
}
