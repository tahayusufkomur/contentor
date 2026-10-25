"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Pencil,
  RotateCcw,
  Scissors,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { wordsCut } from "@/lib/reels/studio";
import type { Word } from "@/types/reels";

interface Props {
  words: Word[];
  start: number;
  end: number;
  cuts: [number, number][];
  retyped: Record<string, string>;
  /** The word being said at the playhead, or -1. */
  active: number;
  onSeek: (t: number) => void;
  onCut: (a: number, b: number) => void;
  onPutBack: (a: number, b: number) => void;
  onTrim: (edge: "start" | "end", t: number) => void;
  onRetype: (word: Word, text: string) => void;
}

/** The reel's words, to edit it by its text: click a word to go to it, Shift-click another to select the
 *  words between, then cut them out (with the silence around them), put them back, or start or end the reel
 *  there; double-click a word to retype it in the captions. */
export function StudioTranscript({
  words,
  start,
  end,
  cuts,
  retyped,
  active,
  onSeek,
  onCut,
  onPutBack,
  onTrim,
  onRetype,
}: Props) {
  const t = useTranslations("admin.reels.studio.words");
  const [range, setRange] = useState<[number, number] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const anchor = useRef<number | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // Opened on the reel's first words; the word being said stays in view while it plays. (Only the list
  // scrolls: scrollIntoView would move the page too on a phone.)
  const reveal = (el: Element | null | undefined, centre: boolean) => {
    const box = list.current;
    if (!box || !(el instanceof HTMLElement)) return;
    const top = el.offsetTop;
    if (centre) box.scrollTop = top - box.clientHeight / 2;
    else if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40)
      box.scrollTop = top - box.clientHeight / 3;
  };
  useEffect(() => {
    reveal(list.current?.querySelector("[data-inside]"), true);
  }, []);
  useEffect(() => {
    if (active >= 0)
      reveal(list.current?.querySelector(`[data-index="${active}"]`), false);
  }, [active]);

  const isCut = (w: Word) =>
    cuts.some(([a, b]) => w[0] >= a - 0.01 && w[1] <= b + 0.01);
  const pick = useCallback(
    (i: number, extend: boolean) => {
      const from = anchor.current;
      if (extend && from !== null) {
        setRange([Math.min(from, i), Math.max(from, i)]);
      } else {
        anchor.current = i;
        setRange([i, i]);
      }
      onSeek(words[i][0]);
    },
    [words, onSeek],
  );
  const [first, last] = range ?? [-1, -1];
  const chosen = range ? words.slice(first, last + 1) : [];
  const anyCut = chosen.some(isCut);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 space-y-2 border-b bg-background p-3">
        {range ? (
          <>
            <p className="text-xs font-medium">
              {t("selected", { count: chosen.length })}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  const cut = wordsCut(words, first, last);
                  onCut(cut.a, cut.b);
                  setRange(null);
                }}
              >
                <Scissors className="h-3.5 w-3.5" />
                {t("cutOut")}
              </Button>
              {anyCut ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    const cut = wordsCut(words, first, last);
                    onPutBack(cut.a, cut.b);
                    setRange(null);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("putBack")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() =>
                  onTrim("start", +(words[first][0] - 0.1).toFixed(2))
                }
              >
                <ArrowLeftToLine className="h-3.5 w-3.5" />
                {t("startHere")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() =>
                  onTrim("end", +(words[last][1] + 0.25).toFixed(2))
                }
              >
                <ArrowRightToLine className="h-3.5 w-3.5" />
                {t("endHere")}
              </Button>
              {first === last ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={() => setEditing(first)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("retype")}
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        )}
      </div>
      <div
        ref={list}
        className="relative min-h-0 flex-1 overflow-y-auto p-3 text-sm leading-8"
      >
        {words.map((w, i) =>
          editing === i ? (
            <Retype
              key={w[0]}
              word={w}
              onDone={(text) => {
                setEditing(null);
                if (text !== null && text !== w[2].trim()) onRetype(w, text);
              }}
            />
          ) : (
            <WordChip
              key={w[0]}
              index={i}
              text={w[2]}
              outside={w[1] <= start || w[0] >= end}
              cut={isCut(w)}
              retyped={String(w[0]) in retyped}
              active={i === active}
              picked={i >= first && i <= last}
              onPick={pick}
              onEdit={setEditing}
            />
          ),
        )}
      </div>
    </div>
  );
}

const WordChip = memo(function WordChip({
  index,
  text,
  outside,
  cut,
  retyped,
  active,
  picked,
  onPick,
  onEdit,
}: {
  index: number;
  text: string;
  outside: boolean;
  cut: boolean;
  retyped: boolean;
  active: boolean;
  picked: boolean;
  onPick: (i: number, extend: boolean) => void;
  onEdit: (i: number) => void;
}) {
  return (
    <>
      {" "}
      <button
        type="button"
        data-index={index}
        data-inside={outside ? undefined : ""}
        onClick={(e) => onPick(index, e.shiftKey)}
        onDoubleClick={() => onEdit(index)}
        className={cn(
          "rounded px-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          outside && "text-muted-foreground/60",
          cut &&
            "text-muted-foreground line-through decoration-destructive decoration-2",
          retyped &&
            "underline decoration-chart-2 decoration-dotted underline-offset-4",
          active && "bg-primary text-primary-foreground hover:bg-primary",
          picked && !active && "bg-primary/15 ring-1 ring-primary/40",
        )}
      >
        {text.trim()}
      </button>
    </>
  );
});

/** A word being retyped: Enter or leaving keeps it, Escape does not. */
function Retype({
  word,
  onDone,
}: {
  word: Word;
  onDone: (text: string | null) => void;
}) {
  const [value, setValue] = useState(word[2].trim());
  const ended = useRef(false);
  const end = (text: string | null) => {
    if (ended.current) return;
    ended.current = true;
    onDone(text);
  };
  return (
    <>
      {" "}
      <input
        autoFocus
        value={value}
        maxLength={60}
        aria-label={word[2].trim()}
        size={Math.max(3, value.length + 1)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => end(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") end(value);
          if (e.key === "Escape") end(null);
        }}
        className="rounded border border-primary bg-background px-1 py-0.5 text-sm outline-none ring-2 ring-primary/30"
      />
    </>
  );
}
