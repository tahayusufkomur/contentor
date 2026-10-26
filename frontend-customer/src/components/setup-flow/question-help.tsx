"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";

import type { GuideHelp } from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { HelpPicture } from "./help-pictures";

/** A question explaining itself in place (backend interview_brief.Help): the
 *  example sits under the question, and an ⓘ button opens the plain
 *  explanation and its drawing right below it. Tap to open and tap to close:
 *  no hover, no floating layer, so it works the same on a phone. It renders
 *  nothing when the question has no help. Mount it inside the question's own
 *  screen: it starts closed on every question. */
export function QuestionHelp({ help }: { help?: GuideHelp | null }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  if (!help) return null;
  const more = !!(help.tip || help.picture);
  return (
    <div className="mt-3">
      {help.example && (
        <p className="max-w-[60ch] text-[14.5px] leading-relaxed text-[var(--sf-graphite)]">
          e.g. {help.example}
        </p>
      )}
      {more && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "-ml-1 mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-full px-1 text-[14.5px] font-medium text-[var(--sf-ink)]",
            "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          )}
        >
          <Info className="size-[18px] text-[var(--sf-brass)]" aria-hidden />
          {help.term}
        </button>
      )}
      {more && open && (
        <div
          id={panel}
          className="mt-1 max-w-[760px] rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-tint)] p-4 sm:p-5 motion-safe:animate-[sf-rise_.3s_ease-out_both]"
        >
          {help.tip && (
            <p className="max-w-[60ch] text-[15px] leading-relaxed text-[var(--sf-ink)]">
              {help.tip}
            </p>
          )}
          {help.picture && (
            <div className={cn(help.tip && "mt-4")}>
              <HelpPicture kind={help.picture} sign={help.sign} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
