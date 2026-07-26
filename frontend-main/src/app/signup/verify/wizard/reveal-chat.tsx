"use client";

// The reveal's natural-language site refinement: "make it warmer", "darker
// theme". A site edit is a re-compose with an instruction, so this just talks
// to the backend's ai_compose trust boundary (site_ai.preview_edit/apply_edit)
// — Preview streams a proposed change (free), Apply persists it and spends
// one of the reveal's 3 free applies. Running out never blocks Publish, it
// only stops further chat refinements until the Phase-2 paid quota applies.
import { useCallback, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  applySiteEdit,
  isAbortError,
  previewSiteEdit,
} from "@/lib/wizard/api";

// Mirrors apps/core/onboarding/wizard.py's REVEAL_FREE_APPLIES — there is no
// dedicated "how many do I have left" endpoint, so this is the assumed count
// until the first Apply response reports the server's real number.
const REVEAL_FREE_APPLIES = 3;

type Phase = "idle" | "thinking" | "ready" | "applying";

export function RevealChat({ token }: { token: string }) {
  const t = useTranslations("wizard");
  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewPages, setPreviewPages] = useState<unknown>(null);
  const [remaining, setRemaining] = useState(REVEAL_FREE_APPLIES);
  const [error, setError] = useState<string | null>(null);

  const exhausted = remaining <= 0;

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
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runPreview();
                }}
                placeholder={t("revealChat.placeholder")}
                disabled={phase === "thinking"}
                className="min-w-0 flex-1 rounded-xl border border-foreground/[0.08] bg-white px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-primary"
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
