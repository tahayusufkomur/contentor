"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  checkBrandName,
  createPlatformAuthenticated,
  getNameIdeas,
} from "@/lib/api/onboarding";
import { SignupFrame, SignupShell, SlideHeader } from "./signup-shell";
import { ApiError } from "@/types/api";
import { BASE_DOMAIN } from "@/lib/constants";
import { siteSlug } from "@/lib/slug";

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
  const navigate = useNavigate();
  const [brandName, setBrandName] = useState("");
  const [error, setError] = useState("");

  const { run: handleSubmit, loading } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      const { token } = await createPlatformAuthenticated(brandName);
      navigate(`/signup/verify?token=${encodeURIComponent(token)}`);
    },
    {
      onError: (err) => {
        setError(
          err instanceof ApiError
            ? ((err.data?.detail as string | undefined) ?? t("errors.generic"))
            : t("errors.generic"),
        );
      },
    },
  );

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
          loadingText={t("authSubmitting")}
        >
          {t("authSubmit")}
        </Button>
      </form>
    </AuthShell>
  );
}

type Step = "brand" | "contact" | "email-sent";

const DRAFT_KEY = "contentor_signup_draft";
const RESEND_COOLDOWN_SECONDS = 30; // the endpoint allows 5/min per IP
// The name is reviewed in the background once typing pauses, so Continue
// rarely waits. Capped per page: the check endpoint allows 30/min per IP.
const REVIEW_DEBOUNCE_MS = 900;
const REVIEW_MIN_CHARS = 3;
const MAX_BACKGROUND_REVIEWS = 10;

/** New coach: brand name -> name+email -> verification email sent. The rest
 * of onboarding happens in the coach's own /setup after the email link. */
function AnonymousSignupFlow() {
  const t = useTranslations("auth.signup");
  const [step, setStep] = useState<Step>("brand");
  const [direction, setDirection] = useState(1);
  const [brandName, setBrandName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [restored, setRestored] = useState(false);
  // The AI's look at the name: shown once per name; Continue again keeps it.
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<{
    typo: string;
    suggestions: string[];
  } | null>(null);
  // The in-flight (or finished) background review, keyed by the name it was for.
  const review = useRef<{
    name: string;
    promise: Promise<Awaited<ReturnType<typeof checkBrandName>> | null>;
  } | null>(null);
  const reviewCount = useRef(0);
  // "Need a name?": ideas from what the coach teaches.
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [firstName, setFirstName] = useState("");
  const [generated, setGenerated] = useState<string[] | null>(null);
  const [ideasFailed, setIdeasFailed] = useState(false);

  // A reload (or a password manager's autofill hiccup) must not wipe the form:
  // keep {brand, name, email, step} for this tab only.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.brandName === "string") setBrandName(d.brandName);
        if (typeof d.name === "string") setName(d.name);
        if (typeof d.email === "string") setEmail(d.email);
        if (d.step === "contact" || d.step === "email-sent") setStep(d.step);
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
        JSON.stringify({ brandName, name, email, step }),
      );
    } catch {
      // private mode — the draft just isn't kept
    }
  }, [restored, brandName, name, email, step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    const trimmed = brandName.trim();
    if (
      step !== "brand" ||
      trimmed.length < REVIEW_MIN_CHARS ||
      reviewed.includes(trimmed) ||
      review.current?.name === trimmed ||
      reviewCount.current >= MAX_BACKGROUND_REVIEWS
    )
      return;
    const id = setTimeout(() => {
      reviewCount.current += 1;
      review.current = {
        name: trimmed,
        promise: checkBrandName(trimmed, true).catch(() => null),
      };
    }, REVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [brandName, step, reviewed]);

  // A picked name is already checked (free to take): fill it in, no second review.
  const pick = (next: string) => {
    setBrandName(next);
    setGenerated(null);
    setReviewed((r) => [...r, next]);
    setIdeas(null);
  };

  const { run: handleBrandContinue, loading: brandLoading } = useAsyncAction(
    async () => {
      const trimmed = brandName.trim();
      if (!trimmed) return;
      setError(null);
      const fresh = !reviewed.includes(trimmed);
      // Same name as the background review: wait for it instead of asking twice.
      const early =
        fresh && review.current?.name === trimmed
          ? await review.current.promise
          : null;
      const result = early ?? (await checkBrandName(trimmed, fresh));
      if (!result.available) {
        setError(result.detail ?? t("errors.generic"));
        return;
      }
      const suggestions = result.suggestions ?? [];
      if (fresh && (result.typo_fix || suggestions.length)) {
        setReviewed((r) => [...r, trimmed]);
        setIdeas({ typo: result.typo_fix ?? "", suggestions });
        return;
      }
      setIdeas(null);
      setDirection(1);
      setStep("contact");
    },
    { onError: () => setError(t("errors.generic")) },
  );

  const { run: handleGetIdeas, loading: ideasLoading } = useAsyncAction(
    async () => {
      const what = topic.trim();
      if (!what) return;
      setIdeasFailed(false);
      const list = await getNameIdeas(what, firstName.trim());
      setGenerated(list);
      setIdeasFailed(list.length === 0);
    },
    { onError: () => setIdeasFailed(true) },
  );

  const { run: handleContactSubmit, loading: contactLoading } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
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
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
    { onError: () => setError(t("errors.generic")) },
  );

  const { run: handleResend, loading: resending } = useAsyncAction(
    async () => {
      const res = await fetch("/api/v1/onboarding/signup/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandName, name, email }),
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
        progress={85}
        onBack={() => {
          setDirection(-1);
          setStep("contact");
        }}
      >
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl glass-strong">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            <strong className="text-foreground">{brandName}</strong>
          </p>
          <p className="mt-4 text-[13px] text-muted-foreground">
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
      <SignupShell
        stepId="brand"
        direction={direction}
        progress={30}
        canBack={false}
        onBack={() => {}}
        error={error}
        footer={
          <>
            <Button
              type="submit"
              form="brand-form"
              variant="brand"
              size="lg"
              className="w-full max-w-[340px]"
              loading={brandLoading}
              loadingText={t("checking")}
              disabled={!brandName.trim()}
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
          {/* A form, so Enter continues; the password-manager opt-outs keep its
           * icon from covering the Continue button on this non-credential field. */}
          <form
            id="brand-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (brandName.trim() && !brandLoading) void handleBrandContinue();
            }}
            className="mx-auto mt-5 max-w-[380px] space-y-2"
          >
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
              onChange={(e) => {
                setBrandName(e.target.value);
                setIdeas(null);
              }}
              autoFocus
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
            />
            {/* The address is made from the name once and never changes. */}
            {siteSlug(brandName) && (
              <p className="text-[12.5px] leading-snug text-muted-foreground">
                {t("addressPreview", {
                  address: `${siteSlug(brandName)}.${BASE_DOMAIN}`,
                })}
              </p>
            )}
            {ideas && (
              <div className="space-y-3 pt-2 text-sm motion-safe:animate-fade-in">
                {ideas.typo && (
                  <p className="text-foreground/80">
                    {t("nameTypo")}{" "}
                    <button
                      type="button"
                      className="font-semibold text-foreground underline underline-offset-2"
                      onClick={() => pick(ideas.typo)}
                    >
                      {ideas.typo}
                    </button>
                    ?
                  </p>
                )}
                {ideas.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[13px] text-foreground/60">
                      {t("nameIdeas")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ideas.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => pick(s)}
                          className="rounded-full border px-3 py-1.5 text-[13px] transition-colors hover:bg-muted"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[13px] text-foreground/60">
                  {t("nameKeep")}
                </p>
              </div>
            )}
          </form>
          <div className="mx-auto mt-4 max-w-[380px] text-sm">
            {!ideasOpen ? (
              <button
                type="button"
                className="text-[13px] text-foreground/60 underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setIdeasOpen(true)}
              >
                {t("needName")}
              </button>
            ) : (
              <div className="space-y-2 motion-safe:animate-fade-in">
                <Label
                  htmlFor="ideasTopic"
                  className="text-[13px] font-medium text-foreground/80"
                >
                  {t("ideasTopicLabel")}
                </Label>
                <Input
                  id="ideasTopic"
                  placeholder={t("ideasTopicPlaceholder")}
                  value={topic}
                  maxLength={120}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (topic.trim() && !ideasLoading) void handleGetIdeas();
                    }
                  }}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
                <Label
                  htmlFor="ideasFirstName"
                  className="text-[13px] font-medium text-foreground/80"
                >
                  {t("ideasFirstNameLabel")}
                </Label>
                <Input
                  id="ideasFirstName"
                  value={firstName}
                  maxLength={40}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
                <Button
                  type="button"
                  variant="outline"
                  loading={ideasLoading}
                  loadingText={t("ideasGetting")}
                  disabled={!topic.trim()}
                  onClick={() => void handleGetIdeas()}
                >
                  {t("ideasGet")}
                </Button>
                {ideasFailed && (
                  <p className="text-[13px] text-foreground/60">
                    {t("ideasFailed")}
                  </p>
                )}
                {generated && generated.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[13px] text-foreground/60">
                      {t("ideasPick")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {generated.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => pick(s)}
                          className="rounded-full border px-3 py-1.5 text-[13px] transition-colors hover:bg-muted"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SignupShell>
    );
  }

  // step === "contact"
  return (
    <SignupShell
      stepId="contact"
      direction={direction}
      progress={60}
      canBack
      onBack={() => {
        setError(null);
        setDirection(-1);
        setStep("brand");
      }}
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
