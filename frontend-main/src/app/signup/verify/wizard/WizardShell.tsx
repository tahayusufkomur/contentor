"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { CHAPTERS, type ChapterId } from "@/lib/wizard/machine";

interface WizardShellProps {
  chapter: ChapterId;
  progress: number; // 0-100
  canBack: boolean;
  onBack: () => void;
  showFinishRest: boolean;
  onFinishRest: () => void;
  error: string | null;
  footer: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode; // live preview (desktop)
}

export function WizardShell({
  chapter, progress, canBack, onBack, showFinishRest, onFinishRest, error, footer, children, aside,
}: WizardShellProps) {
  const t = useTranslations("wizard");
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="aurora animate-aurora" />
        <div className="grid-fade absolute inset-0 opacity-40" />
      </div>

      <div className="mx-auto flex h-full w-full max-w-[980px] gap-8 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex h-full min-w-0 flex-1 flex-col md:max-w-[440px]">
          <header className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onBack}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                canBack
                  ? "bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/[0.1]"
                  : "pointer-events-none opacity-0"
              }`}
              aria-label={t("common.back")}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                {CHAPTERS.map((c) => (
                  <span key={c} className={c === chapter ? "text-foreground" : undefined}>
                    {t(`chapters.${c}`)}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </header>

          <div className="relative mt-6 min-h-0 flex-1 overflow-y-auto pb-2">{children}</div>

          {error && <p className="mt-2 text-center text-[12.5px] text-destructive">{error}</p>}

          <footer className="mt-4 space-y-2">
            {footer}
            {showFinishRest && (
              <button
                type="button"
                onClick={onFinishRest}
                className="w-full text-center text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("common.finishRest")}
              </button>
            )}
          </footer>
        </div>

        {aside && <aside className="hidden h-full flex-1 items-center md:flex">{aside}</aside>}
      </div>
    </div>
  );
}
