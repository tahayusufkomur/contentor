"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { executeCopilotAction } from "@/lib/copilot/api";
import type { ActionCard as ActionCardData } from "@/lib/copilot/types";

const PAGE_NAME_KEYS = new Set([
  "home",
  "about",
  "courses",
  "pricing",
  "faq",
  "contact",
]);
const FIELD_NAME_KEYS = new Set([
  "heading",
  "subheading",
  "body",
  "ctaText",
  "buttonText",
  "intro",
  "items",
]);

export function ActionCard({ card }: { card: ActionCardData }) {
  const t = useTranslations("student.copilot");
  const router = useRouter();
  const [state, setState] = useState<"proposed" | "done" | "dismissed">(
    "proposed",
  );

  const { run: confirm, loading } = useAsyncAction(
    async () => {
      await executeCopilotAction(card.token);
      setState("done");
      router.refresh();
      toast.success(t("applied"));
    },
    { errorToast: t("error") },
  );

  if (state === "dismissed") return null;
  return (
    <div
      className="mt-2 rounded-lg border bg-background p-3 text-sm"
      data-copilot-ui
    >
      <p className="font-medium">{card.title}</p>
      {card.detail && (
        <p className="mt-1 text-muted-foreground">{card.detail}</p>
      )}
      {card.changes && card.changes.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
          {card.changes.map((c, i) => (
            <li key={i}>
              <p className="text-xs font-medium text-muted-foreground">
                {PAGE_NAME_KEYS.has(c.page) ? t(`pageNames.${c.page}`) : c.page}{" "}
                ›{" "}
                {FIELD_NAME_KEYS.has(c.field)
                  ? t(`fieldNames.${c.field}`)
                  : c.field}
              </p>
              {c.old !== null && c.new !== null ? (
                <>
                  <p className="line-clamp-2 text-muted-foreground line-through decoration-muted-foreground/40">
                    {c.old}
                  </p>
                  <p className="line-clamp-3">{c.new}</p>
                </>
              ) : (
                <p className="text-muted-foreground">{t("updated")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {state === "done" ? (
        <p className="mt-2 text-xs font-medium text-primary">
          {t("appliedShort")}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="brand"
            onClick={confirm}
            loading={loading}
            loadingText={t("applying")}
          >
            {t("confirm")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState("dismissed")}
          >
            {t("dismiss")}
          </Button>
        </div>
      )}
    </div>
  );
}
