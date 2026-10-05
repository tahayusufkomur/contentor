"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

/** Full-screen frame for the two signup steps (brand, then name + email).
 * Everything after the email link happens in the coach's own /setup. */
export function SignupShell({
  stepId,
  direction,
  progress,
  canBack,
  onBack,
  error,
  footer,
  children,
}: {
  stepId: string;
  direction: number; // 1 = forward, -1 = back; drives the slide direction
  progress: number; // 0-100
  canBack: boolean;
  onBack: () => void;
  error: string | null;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("auth.signup");

  return (
    // reducedMotion="user": framer drops transforms when the OS asks for
    // less motion, keeping only opacity.
    <MotionConfig reducedMotion="user">
      <div className="fixed inset-0 z-50 overflow-hidden bg-background">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="aurora animate-aurora" />
          <div className="grid-fade absolute inset-0 opacity-40" />
        </div>

        <div className="flex h-full w-full flex-col items-center px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
          <header className="flex w-full items-center gap-3 pt-1 md:max-w-[640px]">
            <button
              type="button"
              onClick={onBack}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                canBack
                  ? "bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/[0.1]"
                  : "pointer-events-none opacity-0"
              }`}
              aria-label={t("back")}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
              <motion.div
                className="h-full rounded-full bg-foreground"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 150, damping: 24 }}
              />
            </div>
          </header>

          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col md:max-w-[640px]">
            <div className="relative mt-6 min-h-0 flex-1 overflow-y-auto pb-2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stepId}
                  initial={{ opacity: 0, x: 28 * direction }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -28 * direction }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-h-full flex-col justify-center"
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>

            {error && (
              <p className="mt-2 text-center text-[12.5px] text-destructive">
                {error}
              </p>
            )}

            <footer className="mt-4 flex flex-col items-center gap-2">
              {footer}
            </footer>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

export function SlideHeader({
  heading,
  subhead,
}: {
  heading: string;
  subhead: string;
}) {
  return (
    <div className="flex-shrink-0 text-center">
      <h2 className="text-display text-[24px] leading-tight tracking-[-0.02em] md:text-[26px]">
        {heading}
      </h2>
      <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted-foreground">
        {subhead}
      </p>
    </div>
  );
}
