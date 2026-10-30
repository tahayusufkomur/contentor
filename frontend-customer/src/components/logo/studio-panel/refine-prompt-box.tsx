"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { LogoAiStatus } from "@/lib/logo/converse-api";

/** AI "ask the designer" box — paid tenants only, same gate/reason codes as
 * the Brand Pack. Scope is the whole design (mark, palette, font, layout),
 * so it lives at the top of the panel regardless of which element is
 * selected, unlike the per-element control sections below it. */
export function RefinePromptBox({
  logoAiStatus,
  refining,
  refineNotice,
  onRefine,
}: {
  logoAiStatus: LogoAiStatus | null;
  refining: boolean;
  refineNotice: string | null;
  onRefine: (instruction: string, redrawMark: boolean) => void;
}) {
  const t = useTranslations("admin.logo.refine");
  const [instruction, setInstruction] = useState("");
  const [redrawMark, setRedrawMark] = useState(false);
  if (!logoAiStatus?.eligible) return null;
  const remaining = logoAiStatus.refine_remaining;
  const blocked = !logoAiStatus.enabled || remaining <= 0;

  return (
    <section className="space-y-1.5 rounded-md border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {t("title")}
      </p>
      {blocked ? (
        <p className="text-xs text-muted-foreground">
          {remaining <= 0 ? t("quota") : t("unavailable")}
        </p>
      ) : (
        <>
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={2}
            maxLength={300}
            placeholder={t("placeholder")}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={refining}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={redrawMark}
              onChange={(e) => setRedrawMark(e.target.checked)}
              disabled={refining}
            />
            {t("redraw")}
          </label>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!instruction.trim()}
              loading={refining}
              loadingText={t("refining")}
              onClick={() => {
                onRefine(instruction.trim(), redrawMark);
                setInstruction("");
                setRedrawMark(false);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("refine")}
            </Button>
            <p className="text-right text-xs text-muted-foreground">
              {t("left", { count: remaining })}
            </p>
          </div>
        </>
      )}
      {refineNotice && (
        <p className="text-xs italic text-muted-foreground">{refineNotice}</p>
      )}
    </section>
  );
}
