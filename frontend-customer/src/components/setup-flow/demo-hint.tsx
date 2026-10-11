import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A small, calm "here is what to do" demo: a looping picture of the gesture
 * (``children``) beside one plain caption. Purely decorative (aria-hidden,
 * not clickable); the caption is the real instruction, so it is also read
 * out. ``show`` false fades it away and gives its room back. The loop plays
 * only under `motion-safe:`; reduced motion gets the still end state. */
export function DemoHint({
  caption,
  show,
  children,
}: {
  caption: string;
  show: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "mt-6 grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out",
        show ? "grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--sf-tint)] px-4 py-3.5 sm:flex-row sm:gap-5">
          <div
            aria-hidden
            className="pointer-events-none relative w-[250px] max-w-full shrink-0 select-none"
          >
            {children}
          </div>
          <p className="text-center text-[14px] leading-snug text-[var(--sf-graphite)] sm:text-left">
            {caption}
          </p>
        </div>
      </div>
    </div>
  );
}

/** The demo for sentence-starter questions: a pointer taps a ghost card, the
 * card turns ink like a picked one, and a few words type in after the
 * starter. The still state (no motion) is the finished sentence. */
export function StarterDemo() {
  return (
    <div className="relative">
      <div className="flex h-[76px] flex-col rounded-2xl border border-[var(--sf-ink)] bg-[var(--sf-ink)] px-3.5 py-3 text-[13.5px] font-medium leading-snug text-[var(--sf-paper)] motion-safe:animate-[sf-demo-card_7s_ease-in-out_infinite]">
        <span>I started teaching when…</span>
        <span className="block max-w-[26ch] overflow-hidden whitespace-nowrap font-normal motion-safe:animate-[sf-demo-type_7s_steps(26,end)_infinite]">
          a friend asked me to cover
        </span>
      </div>
      <span className="absolute left-[46%] top-[42%] size-5 rounded-full border-2 border-[var(--sf-paper)] bg-[var(--sf-brass)] opacity-0 shadow-[0_0_0_4px_var(--sf-brass-soft)] motion-safe:animate-[sf-demo-tap_7s_ease-in-out_infinite]" />
    </div>
  );
}
