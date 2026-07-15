"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { CHAPTERS, type ChapterId } from "@/lib/wizard/machine";

import { FontPreviewLoader } from "./previews";

interface WizardShellProps {
  chapter: ChapterId;
  stepId: string;
  direction: number; // 1 = forward, -1 = back; drives the slide direction
  progress: number; // 0-100
  canBack: boolean;
  onBack: () => void;
  showFinishRest: boolean;
  onFinishRest: () => void;
  error: string | null;
  footer: React.ReactNode;
  children: React.ReactNode;
  /** Page-layout steps need room for full-size mockups; list steps read
   * better narrow. The column morphs between the two. */
  wide?: boolean;
}

export function WizardShell({
  chapter, stepId, direction, progress, canBack, onBack, showFinishRest, onFinishRest, error, footer, children, wide,
}: WizardShellProps) {
  const t = useTranslations("wizard");

  return (
    // reducedMotion="user" makes framer drop every transform/layout animation
    // (x, y, scale, width morph) when the OS asks for less motion, keeping
    // only opacity — so no component below needs to gate motion by hand.
    <MotionConfig reducedMotion="user">
    <div className="fixed inset-0 z-50 overflow-hidden bg-background">
      <FontPreviewLoader />
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="aurora animate-aurora" />
        <div className="grid-fade absolute inset-0 opacity-40" />
      </div>

      <div className="flex h-full w-full justify-center px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 240, damping: 30 }}
          className={`flex h-full w-full min-w-0 flex-col ${wide ? "md:max-w-[760px]" : "md:max-w-[520px]"}`}
        >
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
                  <span
                    key={c}
                    className={`transition-colors duration-500 ${c === chapter ? "text-foreground" : ""}`}
                  >
                    {t(`chapters.${c}`)}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                <motion.div
                  className="h-full rounded-full bg-foreground"
                  initial={false}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: "spring", stiffness: 150, damping: 24 }}
                />
              </div>
            </div>
          </header>

          <div className="relative mt-6 min-h-0 flex-1 overflow-y-auto pb-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={stepId}
                initial={{ opacity: 0, x: 28 * direction }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 * direction }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                // Short steps sit centered in the viewport instead of stranded
                // at the top; taller ones outgrow min-h-full and scroll.
                className="flex min-h-full flex-col justify-center"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>

          {error && <p className="mt-2 text-center text-[12.5px] text-destructive">{error}</p>}

          <footer className="mt-4 flex flex-col items-center gap-2">
            {footer}
            {showFinishRest && (
              <button
                type="button"
                onClick={onFinishRest}
                className="text-center text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("common.finishRest")}
              </button>
            )}
          </footer>
        </motion.div>
      </div>
    </div>
    </MotionConfig>
  );
}
