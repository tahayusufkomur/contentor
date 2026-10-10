"use client";

import { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicButton } from "@/components/copilot/mic-button";
import { joinSpeech } from "@/lib/interview";
import { cn } from "@/lib/utils";

/** A typed or dictated answer: Enter sends, Shift+Enter breaks the line.
 * The text is the caller's, so it survives moving between questions and a
 * send that didn't go through. */
export function AnswerBox({
  value,
  onChange,
  sending,
  onSubmit,
  placeholder,
  className,
}: {
  value: string;
  onChange: (update: (prev: string) => string) => void;
  sending: boolean;
  onSubmit: (text: string, spoken: boolean) => void;
  placeholder: string;
  className?: string;
}) {
  const [hearing, setHearing] = useState("");
  const spoken = useRef(false);

  const text = joinSpeech(value, hearing).trim();
  const submit = () => {
    if (!text || sending) return;
    onSubmit(text, spoken.current);
    setHearing("");
    spoken.current = false;
  };

  return (
    <form
      className={cn(
        "flex items-end gap-2 rounded-2xl border border-[var(--sf-line-strong)] bg-white py-2 pl-4 pr-2",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="min-w-0 flex-1 py-1.5">
        <textarea
          aria-label="Your answer"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(() => next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={placeholder}
          className="block max-h-40 w-full resize-none bg-transparent text-[15px] leading-relaxed [field-sizing:content] focus:outline-none"
        />
        {hearing && (
          <p
            aria-live="polite"
            className="text-[13px] italic text-[var(--sf-faint)]"
          >
            {hearing}
          </p>
        )}
      </div>
      <MicButton
        disabled={sending}
        className="mb-0.5 p-1.5"
        onText={(heard, final) => {
          if (final) {
            onChange((d) => joinSpeech(d, heard));
            setHearing("");
            spoken.current = true;
          } else {
            setHearing(heard);
          }
        }}
      />
      <Button
        type="submit"
        size="icon"
        aria-label="Send"
        title="Send"
        loading={sending}
        disabled={!text}
        className="size-9 shrink-0 rounded-full"
      >
        <ArrowUp className="size-4" aria-hidden />
      </Button>
    </form>
  );
}
