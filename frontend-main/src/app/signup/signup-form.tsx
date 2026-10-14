"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Mail,
  Pencil,
  Plus,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  checkBrandName,
  createPlatformAuthenticated,
  extractDoc,
  type ExtractDocResponse,
  type ExtractedFact,
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

/** The first step of the onboarding wizard: validate brand name, review for typos,
 * offer brand ideas, and ensure the domain is available before proceeding. */
interface BrandStepProps {
  heading: string;
  subhead: string;
  submitLabel: string;
  submittingLabel?: string;
  keepText: string;
  progress?: number;
  initialBrandName?: string;
  onBrandNameChange?: (name: string) => void;
  canBack?: boolean;
  onBack?: () => void;
  footerExtra?: React.ReactNode;
  onProceed: (validBrandName: string) => Promise<void> | void;
}

function BrandStep({
  heading,
  subhead,
  submitLabel,
  submittingLabel,
  keepText,
  progress = 25,
  initialBrandName = "",
  onBrandNameChange,
  canBack = false,
  onBack = () => {},
  footerExtra,
  onProceed,
}: BrandStepProps) {
  const t = useTranslations("auth.signup");
  const [brandName, setBrandName] = useState(initialBrandName);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<{
    typo: string;
    suggestions: string[];
  } | null>(null);

  const review = useRef<{
    name: string;
    promise: Promise<Awaited<ReturnType<typeof checkBrandName>> | null>;
  } | null>(null);
  const reviewCount = useRef(0);
  const brandNameRef = useRef(brandName);

  useEffect(() => {
    brandNameRef.current = brandName;
    onBrandNameChange?.(brandName);
  }, [brandName, onBrandNameChange]);

  // "Need a name?": ideas from what the coach teaches.
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [firstName, setFirstName] = useState("");
  const [generated, setGenerated] = useState<string[] | null>(null);
  const [ideasFailed, setIdeasFailed] = useState(false);

  const runReview = useCallback((nameToCheck: string) => {
    const trimmed = nameToCheck.trim();
    if (
      trimmed.length < REVIEW_MIN_CHARS ||
      reviewCount.current >= MAX_BACKGROUND_REVIEWS
    )
      return;

    if (review.current?.name === trimmed) {
      review.current.promise.then((result) => {
        if (
          brandNameRef.current.trim() === trimmed &&
          result?.available &&
          (result.typo_fix ||
            (result.suggestions && result.suggestions.length > 0))
        ) {
          setIdeas({
            typo: result.typo_fix ?? "",
            suggestions: result.suggestions ?? [],
          });
        }
      });
      return;
    }

    reviewCount.current += 1;
    const promise = checkBrandName(trimmed, true).catch(() => null);
    review.current = {
      name: trimmed,
      promise,
    };
    promise.then((result) => {
      if (!result) return;
      if (
        brandNameRef.current.trim() === trimmed &&
        result.available &&
        (result.typo_fix ||
          (result.suggestions && result.suggestions.length > 0))
      ) {
        setIdeas({
          typo: result.typo_fix ?? "",
          suggestions: result.suggestions ?? [],
        });
      }
    });
  }, []);

  useEffect(() => {
    const trimmed = brandName.trim();
    if (
      trimmed.length < REVIEW_MIN_CHARS ||
      reviewCount.current >= MAX_BACKGROUND_REVIEWS
    )
      return;
    const id = setTimeout(() => {
      runReview(trimmed);
    }, REVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [brandName, runReview]);

  const pick = (next: string) => {
    setBrandName(next);
    setGenerated(null);
    setIdeas(null);
    setError(null);
  };

  const [phase, setPhase] = useState<"checking" | "submitting">("checking");

  const { run: handleSubmit, loading } = useAsyncAction(
    async () => {
      const trimmed = brandName.trim();
      if (!trimmed) return;
      setError(null);

      // If typo/ideas are currently showing for this name, the coach chose
      // to keep their name as typed by clicking Continue/Submit.
      if (ideas && (ideas.typo || ideas.suggestions.length > 0)) {
        setIdeas(null);
        setPhase("submitting");
        await onProceed(trimmed);
        return;
      }

      setPhase("checking");
      const promise =
        review.current?.name === trimmed
          ? review.current.promise
          : checkBrandName(trimmed, true).catch(() => null);

      const result = await promise;
      if (result && !result.available) {
        setError(result.detail ?? t("errors.generic"));
        return;
      }

      const suggestions = result?.suggestions ?? [];
      if (result && (result.typo_fix || suggestions.length > 0)) {
        setIdeas({
          typo: result.typo_fix ?? "",
          suggestions,
        });
        return;
      }

      setIdeas(null);
      setPhase("submitting");
      await onProceed(trimmed);
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

  return (
    <SignupShell
      stepId="brand"
      direction={1}
      progress={progress}
      canBack={canBack}
      onBack={onBack}
      error={error}
      footer={
        <>
          <Button
            type="submit"
            form="brand-form"
            variant="brand"
            size="lg"
            className="w-full max-w-[340px]"
            loading={loading}
            loadingText={
              phase === "checking"
                ? t("checking")
                : (submittingLabel ?? t("submitting"))
            }
            disabled={!brandName.trim()}
          >
            {submitLabel}
          </Button>
          {footerExtra}
        </>
      }
    >
      <div>
        <SlideHeader heading={heading} subhead={subhead} />
        {/* A form, so Enter continues; the password-manager opt-outs keep its
         * icon from covering the Continue button on this non-credential field. */}
        <form
          id="brand-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (brandName.trim() && !loading) void handleSubmit();
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
              setError(null);
            }}
            onBlur={() => {
              runReview(brandName);
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
              <p className="text-[13px] text-foreground/60">{keepText}</p>
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

/** The optional second step of the onboarding wizard: upload a file (.pdf, .txt, .md)
 * or paste background notes about the coach, used downstream in /setup to prefill questions. */
interface AboutStepProps {
  heading: string;
  /** The studio name picked on the step before, checked against the bio. */
  brandName: string;
  subhead: string;
  submitLabel?: string;
  submittingLabel?: string;
  skipLabel?: string;
  initialText?: string;
  progress?: number;
  canBack?: boolean;
  onBack?: () => void;
  footerExtra?: React.ReactNode;
  onProceed: (aboutText: string) => Promise<void> | void;
}

function AboutStep({
  heading,
  brandName,
  subhead,
  submitLabel,
  submittingLabel,
  skipLabel,
  initialText = "",
  progress = 50,
  canBack = true,
  onBack = () => {},
  footerExtra,
  onProceed,
}: AboutStepProps) {
  const t = useTranslations("auth.signup");
  const [text, setText] = useState(initialText);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFact[] | null>(
    null,
  );
  const [extractedSummary, setExtractedSummary] = useState<string | null>(null);
  const [conflict, setConflict] =
    useState<ExtractDocResponse["conflict"]>(null);
  const [hasAdded, setHasAdded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { run: handleAdd, loading: analyzing } = useAsyncAction(
    async () => {
      const trimmed = text.trim();
      if (!trimmed && !selectedFile) {
        setError(t("aboutEmptyWarning"));
        return;
      }
      setError(null);
      const result = await extractDoc(
        selectedFile || undefined,
        trimmed,
        brandName,
      );
      setText(result.text);
      setExtractedFacts(result.facts);
      setExtractedSummary(result.summary);
      setConflict(result.conflict ?? null);
      setHasAdded(true);
      setIsEditing(false);
    },
    {
      onError: (err) => {
        setError(
          err instanceof ApiError
            ? ((err.data?.detail as string | undefined) ?? t("errors.generic"))
            : err instanceof Error
              ? err.message
              : t("errors.generic"),
        );
      },
    },
  );

  const { run: handleContinue, loading: submitting } = useAsyncAction(
    async () => {
      setError(null);
      await onProceed(text.trim());
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

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setSelectedFile(f);
      setFileName(f.name);
      setError(null);
    }
  };

  const handleSkip = () => {
    setError(null);
    void onProceed("");
  };

  const showExtractedView = hasAdded && !isEditing;

  return (
    <SignupShell
      stepId="about"
      direction={1}
      progress={progress}
      canBack={canBack}
      onBack={onBack}
      error={error}
      footer={
        showExtractedView ? (
          <>
            <Button
              type="button"
              variant="brand"
              size="lg"
              className="w-full max-w-[340px]"
              loading={submitting}
              loadingText={submittingLabel ?? t("submitting")}
              onClick={() => void handleContinue()}
            >
              {submitLabel ?? t("aboutContinue")}
            </Button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={submitting}
              className="text-[13px] text-muted-foreground underline-offset-4 hover:underline hover:text-foreground transition-colors disabled:opacity-50"
            >
              {t("aboutEditNotes")}
            </button>
            {footerExtra}
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="brand"
              size="lg"
              className="w-full max-w-[340px]"
              loading={analyzing}
              loadingText={t("aboutAnalyzing")}
              disabled={!text.trim() && !selectedFile}
              onClick={() => void handleAdd()}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t("aboutAddButton")}
            </Button>
            {hasAdded ? (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={analyzing}
                className="text-[13px] text-muted-foreground underline-offset-4 hover:underline hover:text-foreground transition-colors disabled:opacity-50"
              >
                {t("back")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSkip}
                disabled={analyzing}
                className="text-[13px] text-muted-foreground underline-offset-4 hover:underline hover:text-foreground transition-colors disabled:opacity-50"
              >
                {skipLabel ?? t("aboutSkip")}
              </button>
            )}
            {footerExtra}
          </>
        )
      }
    >
      <div>
        {showExtractedView ? (
          <div>
            <SlideHeader
              heading={t("aboutExtractedTitle")}
              subhead={t("aboutExtractedSub")}
            />
            <div className="mx-auto mt-5 max-w-[420px] space-y-3.5">
              {conflict && (
                <div
                  role="status"
                  className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-[13px] text-foreground motion-safe:animate-fade-in"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      {t("aboutConflict", {
                        brand: brandName,
                        nameSays: conflict.name_says,
                        bioSays: conflict.bio_says,
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[26px]">
                    <button
                      type="button"
                      onClick={onBack}
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      {t("aboutConflictChange")}
                    </button>
                    <span className="text-muted-foreground">
                      {t("aboutConflictKeep")}
                    </span>
                  </div>
                </div>
              )}
              {extractedSummary && (
                <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-[13px] text-foreground motion-safe:animate-fade-in">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{extractedSummary}</span>
                </div>
              )}

              {extractedFacts && extractedFacts.length > 0 ? (
                <div className="space-y-2.5 motion-safe:animate-fade-in">
                  {extractedFacts.map((fact) => (
                    <div
                      key={fact.field}
                      className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-foreground">
                          {fact.label}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                          {t("aboutAnswersBadge", { answers: fact.answers })}
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        {fact.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-center text-[13px] text-muted-foreground motion-safe:animate-fade-in">
                  <CheckCircle2 className="h-5 w-5 text-primary mx-auto mb-1.5" />
                  <p>{t("aboutGeneralNote")}</p>
                </div>
              )}

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                  {t("aboutEditNotes")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <SlideHeader heading={heading} subhead={subhead} />
            <div className="mx-auto mt-5 max-w-[420px] space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown"
                onChange={onFileChange}
                className="hidden"
              />

              {fileName ? (
                <div className="flex items-center justify-between rounded-xl border border-input bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {fileName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={analyzing}
                      className="text-[12px] font-medium text-primary hover:underline"
                    >
                      {t("aboutFileButtonChange")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setFileName(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => {
                    if (!analyzing) fileInputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !analyzing) {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="group flex flex-col items-center justify-center rounded-xl border border-dashed border-input bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-background shadow-xs group-hover:text-primary">
                    <UploadCloud className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-[13px] font-medium text-foreground">
                    {t("aboutFileButton")}
                  </span>
                  <span className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("aboutFileHint")}
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label
                  htmlFor="about-textarea"
                  className="text-[13px] font-medium text-foreground/80"
                >
                  {t("aboutOrPaste")}
                </Label>
                <textarea
                  id="about-textarea"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError(null);
                  }}
                  maxLength={8000}
                  rows={10}
                  placeholder={t("aboutTextPlaceholder")}
                  className="flex min-h-[240px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="flex justify-end text-[11px] text-muted-foreground">
                  <span>{text.length} / 8000</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </SignupShell>
  );
}

/** Already-logged-in coach creating an additional platform: validates the brand
 * name and checks for typos first, then lets the coach provide background,
 * and finally provisions the platform and moves to /signup/verify. */
function AuthenticatedSignupForm({
  authenticatedName,
}: {
  authenticatedName: string;
}) {
  const t = useTranslations("auth.signup");
  const navigate = useNavigate();
  const [step, setStep] = useState<"brand" | "about">("brand");
  const [brandName, setBrandName] = useState("");
  const [aboutText, setAboutText] = useState("");

  if (step === "brand") {
    return (
      <BrandStep
        heading={t("authTitle")}
        subhead={t("authSubtitle", { name: authenticatedName })}
        submitLabel={t("submit")}
        submittingLabel={t("checking")}
        keepText={t("nameKeepAuth")}
        progress={35}
        initialBrandName={brandName}
        onBrandNameChange={setBrandName}
        canBack
        onBack={() => navigate("/dashboard")}
        onProceed={(trimmed) => {
          setBrandName(trimmed);
          setStep("about");
        }}
      />
    );
  }

  return (
    <AboutStep
      heading={t("aboutStepHeading")}
      brandName={brandName}
      subhead={t("aboutStepSubhead")}
      submitLabel={t("authSubmit")}
      submittingLabel={t("authSubmitting")}
      skipLabel={t("aboutSkip")}
      initialText={aboutText}
      progress={70}
      canBack
      onBack={() => setStep("brand")}
      onProceed={async (about) => {
        setAboutText(about);
        const { token } = await createPlatformAuthenticated(brandName, about);
        navigate(`/signup/verify?token=${encodeURIComponent(token)}`);
      }}
    />
  );
}

type Step = "brand" | "about" | "contact" | "email-sent";

const DRAFT_KEY = "contentor_signup_draft";
const RESEND_COOLDOWN_SECONDS = 30; // the endpoint allows 5/min per IP
// The name is reviewed in the background once typing pauses, so Continue
// rarely waits. Capped per page: the check endpoint allows 30/min per IP.
const REVIEW_DEBOUNCE_MS = 1000;
const REVIEW_MIN_CHARS = 3;
const MAX_BACKGROUND_REVIEWS = 10;

/** New coach: brand name -> about -> name+email -> verification email sent. The rest
 * of onboarding happens in the coach's own /setup after the email link. */
function AnonymousSignupFlow() {
  const t = useTranslations("auth.signup");
  const [step, setStep] = useState<Step>("brand");
  const [direction, setDirection] = useState(1);
  const [brandName, setBrandName] = useState("");
  const [aboutText, setAboutText] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [restored, setRestored] = useState(false);

  // A reload (or a password manager's autofill hiccup) must not wipe the form:
  // keep {brand, about, name, email, step} for this tab only.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.brandName === "string") setBrandName(d.brandName);
        if (typeof d.aboutText === "string") setAboutText(d.aboutText);
        if (typeof d.name === "string") setName(d.name);
        if (typeof d.email === "string") setEmail(d.email);
        if (
          d.step === "about" ||
          d.step === "contact" ||
          d.step === "email-sent"
        )
          setStep(d.step);
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
        JSON.stringify({ brandName, aboutText, name, email, step }),
      );
    } catch {
      // private mode — the draft just isn't kept
    }
  }, [restored, brandName, aboutText, name, email, step]);

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
        body: JSON.stringify({
          brand_name: brandName,
          name,
          email,
          about_text: aboutText,
        }),
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
        body: JSON.stringify({
          brand_name: brandName,
          name,
          email,
          about_text: aboutText,
        }),
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
      <BrandStep
        heading={t("brandStepHeading")}
        subhead={t("brandStepSubhead")}
        submitLabel={t("submit")}
        submittingLabel={t("submitting")}
        keepText={t("nameKeep")}
        progress={25}
        initialBrandName={brandName}
        onBrandNameChange={setBrandName}
        canBack={false}
        footerExtra={signInLink}
        onProceed={(validBrandName) => {
          setBrandName(validBrandName);
          setDirection(1);
          setStep("about");
        }}
      />
    );
  }

  if (step === "about") {
    return (
      <AboutStep
        heading={t("aboutStepHeading")}
        brandName={brandName}
        subhead={t("aboutStepSubhead")}
        submitLabel={t("submit")}
        skipLabel={t("aboutSkip")}
        initialText={aboutText}
        progress={50}
        canBack
        onBack={() => {
          setDirection(-1);
          setStep("brand");
        }}
        footerExtra={signInLink}
        onProceed={(about) => {
          setAboutText(about);
          setDirection(1);
          setStep("contact");
        }}
      />
    );
  }

  // step === "contact"
  return (
    <SignupShell
      stepId="contact"
      direction={direction}
      progress={75}
      canBack
      onBack={() => {
        setError(null);
        setDirection(-1);
        setStep("about");
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
