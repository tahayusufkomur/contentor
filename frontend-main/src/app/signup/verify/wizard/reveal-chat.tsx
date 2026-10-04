"use client";

// The reveal's natural-language site refinement: "make it warmer", "darker
// theme". A site edit is a re-compose with an instruction, so this just talks
// to the backend's ai_compose trust boundary (site_ai.preview_edit/apply_edit)
// — Preview streams a proposed change (free), Apply persists it and spends
// the reveal's single free apply. Running out never blocks Publish, it
// only stops further chat refinements until the Phase-2 paid quota applies.
import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applySiteEdit,
  isAbortError,
  previewSiteEdit,
  readWizardState,
} from "@/lib/wizard/api";

// Mirrors apps/core/onboarding/wizard.py's REVEAL_FREE_APPLIES — there is no
// shared source between the Django app and this bundle, so the two must be
// changed together; a mismatch shows a wrong "left" count until the first apply.
const REVEAL_FREE_APPLIES = 1;

type Phase = "idle" | "thinking" | "ready" | "applying";

export function RevealChat({ token }: { token: string }) {
  const t = useTranslations("wizard");
  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewPages, setPreviewPages] = useState<unknown>(null);
  const [remaining, setRemaining] = useState(REVEAL_FREE_APPLIES);
  const [error, setError] = useState<string | null>(null);

  const exhausted = remaining <= 0;

  // The counter lives on the server: a coach who already used their free
  // refinement (then reloaded) must not be offered "1 left" again.
  useEffect(() => {
    let cancelled = false;
    readWizardState(token)
      .then((res) => {
        if (cancelled) return;
        const used = res.state.reveal_applies_used ?? 0;
        setRemaining(Math.max(0, REVEAL_FREE_APPLIES - used));
      })
      .catch(() => {}); // keep the optimistic default
    return () => {
      cancelled = true;
    };
  }, [token]);

  const runPreview = useCallback(async () => {
    const text = instruction.trim();
    if (!text || phase === "thinking" || phase === "applying" || exhausted)
      return;
    setError(null);
    setPhase("thinking");
    try {
      const { pages } = await previewSiteEdit(token, text);
      setPreviewPages(pages);
      setPhase("ready");
    } catch (err) {
      if (isAbortError(err)) return;
      setError(t("revealChat.error"));
      setPhase("idle");
    }
  }, [instruction, phase, exhausted, token, t]);

  const applyPreview = useCallback(async () => {
    if (previewPages == null || phase === "applying") return;
    setError(null);
    setPhase("applying");
    try {
      const res = await applySiteEdit(token, previewPages);
      setRemaining(res.remaining);
      setPreviewPages(null);
      setInstruction("");
      setPhase("idle");
    } catch {
      setError(t("revealChat.error"));
      setPhase("ready");
    }
  }, [previewPages, phase, token, t]);

  const discardPreview = useCallback(() => {
    setPreviewPages(null);
    setPhase("idle");
  }, []);

  return (
    <div className="mt-6 w-full rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 text-left">
      <p className="text-[13.5px] font-semibold">{t("revealChat.title")}</p>

      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}

      {exhausted ? (
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          {t("revealChat.exhausted")}
        </p>
      ) : (
        <>
          {previewPages != null ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-[12.5px] text-muted-foreground">
                {t("revealChat.readyHint")}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  onClick={applyPreview}
                  loading={phase === "applying"}
                  loadingText={t("revealChat.applying")}
                >
                  {t("revealChat.apply")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={discardPreview}
                  disabled={phase === "applying"}
                >
                  {t("revealChat.discard")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runPreview();
                }}
                placeholder={t("revealChat.placeholder")}
                disabled={phase === "thinking"}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                onClick={() => void runPreview()}
                disabled={phase === "thinking" || !instruction.trim()}
                loading={phase === "thinking"}
                loadingText={t("revealChat.thinking")}
              >
                <Send className="h-4 w-4" />
                {t("revealChat.preview")}
              </Button>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("revealChat.remaining", { count: remaining })}
          </p>
        </>
      )}
    </div>
  );
}
