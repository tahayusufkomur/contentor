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
import { createPlatformAuthenticated } from "@/lib/api/onboarding";
import { ApiError } from "@/types/api";

type SignupState = "form" | "email-sent" | "error";

interface SignupFormProps {
  /** Set when an already-logged-in coach is creating an additional platform. */
  authenticatedName?: string | null;
}

export function SignupForm({ authenticatedName }: SignupFormProps) {
  const t = useTranslations("auth.signup");
  const router = useRouter();
  const isAuthenticated = Boolean(authenticatedName);
  const [brandName, setBrandName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<SignupState>("form");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Logged-in coach: skip the email-verification round-trip entirely and
    // jump straight into provisioning the new platform.
    if (isAuthenticated) {
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
      return;
    }

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
        setLoading(false);
        return;
      }
      setState("email-sent");
      setLoading(false);
    } catch {
      setError(t("errors.generic"));
      setLoading(false);
    }
  }

  if (state === "email-sent") {
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

  return (
    <AuthShell
      eyebrow={isAuthenticated ? t("authTitle") : t("title")}
      title={isAuthenticated ? t("authTitle") : t("title")}
      subtitle={
        isAuthenticated
          ? t("authSubtitle", { name: authenticatedName ?? "" })
          : t("subtitle")
      }
      footer={
        isAuthenticated ? undefined : (
          <p className="text-[13px] text-muted-foreground">
            {t("alreadyHaveAccount")}{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("signIn")}
            </Link>
          </p>
        )
      }
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
        {!isAuthenticated && (
          <>
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
          </>
        )}
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
          {loading
            ? isAuthenticated
              ? t("authSubmitting")
              : t("submitting")
            : isAuthenticated
              ? t("authSubmit")
              : t("submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
