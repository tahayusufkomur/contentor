"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import {
  ActionCard,
  ApplyAllBar,
  CardBundleProvider,
} from "@/components/copilot/action-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isAbortError } from "@/lib/ai-stream";
import { converseCopilot } from "@/lib/copilot/api";
import type {
  ActionCard as ActionCardData,
  ExecuteResult,
} from "@/lib/copilot/types";
import { useAsyncAction } from "@shared/hooks/use-async-action";

type Turn = { role: string; text: string; kind?: string };

/** One line beside a create button: she describes it, the assistant drafts
 *  it, she reviews the card. The manual form stays where it is and never
 *  waits on this. A turn takes a few seconds, so this is ask → wait → card,
 *  not a chat; if the assistant needs one more detail it says so here and
 *  her next line answers it. */
export function DescribeIt({
  kind,
  onApplied,
}: {
  kind: "course" | "event";
  onApplied?: (result: ExecuteResult) => void;
}) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const inputId = useId();
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [note, setNote] = useState("");
  const [cards, setCards] = useState<ActionCardData[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const { run: draft, loading } = useAsyncAction(
    async () => {
      const message = text.trim();
      if (!message) return;
      const controller = new AbortController();
      abortRef.current = controller;
      // The cards on screen hold single-use tokens: a new draft replaces them.
      setCards([]);
      setNote("");
      try {
        const done = await converseCopilot(
          {
            message,
            transcript: turns,
            selections: [],
            context: {
              path: pathname ?? "/admin",
              intent: kind === "course" ? "draft_course" : "draft_event",
            },
            // Courses and classes are the Content Creating Specialist's work.
            specialist: "content",
          },
          { onPhase: () => {} },
          controller.signal,
        );
        setText("");
        if (done.kind === "unavailable") {
          setNote(t("describe.resting"));
        } else if (done.kind === "actions" && done.actions?.length) {
          setCards(done.actions);
          setNote(done.text ?? "");
          setTurns([]);
        } else {
          // A question (or an answer): shown here, answered by her next line.
          setNote(done.text ?? "");
          setTurns([
            ...turns,
            { role: "coach", text: message },
            { role: "assistant", text: done.text ?? "", kind: done.kind },
          ]);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
    },
    { errorToast: t("describe.failed") },
  );

  return (
    <section className="rounded-xl border bg-card p-3">
      <label
        htmlFor={inputId}
        className="mb-2 flex items-center gap-1.5 text-sm font-medium"
      >
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
        {t(`describe.${kind}.label`)}
      </label>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void draft();
        }}
      >
        <Input
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t(`describe.${kind}.placeholder`)}
          maxLength={600}
          disabled={loading}
          data-testid={`describe-${kind}`}
        />
        <Button
          type="submit"
          variant="outline"
          className="shrink-0"
          disabled={!text.trim()}
          loading={loading}
          loadingText={t("describe.working")}
        >
          {t("describe.submit")}
        </Button>
      </form>
      {loading ? (
        <div role="status" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">{t("describe.wait")}</p>
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <>
          {note && <p className="mt-3 text-sm">{note}</p>}
          {cards.length > 0 && (
            // Keyed by the first token: a new draft replaces the old cards
            // and their apply-all registry together.
            <CardBundleProvider key={cards[0].token}>
              {cards.map((card) => (
                <ActionCard
                  key={card.token}
                  card={card}
                  onApplied={onApplied}
                />
              ))}
              {cards.length > 1 && (
                <div className="mt-2">
                  <ApplyAllBar />
                </div>
              )}
            </CardBundleProvider>
          )}
        </>
      )}
    </section>
  );
}
