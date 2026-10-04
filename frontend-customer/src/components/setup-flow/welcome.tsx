"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SetupFlowState, StepKind } from "@/lib/setup-flow";

const OVERVIEW: { kinds: StepKind[]; title: string; text: string }[] = [
  {
    kinds: ["content"],
    title: "Your first course",
    text: "Tell me what you teach. I’ll draft the course for you.",
  },
  {
    kinds: ["page"],
    title: "Your pages",
    text: "Each page composed in your style, ready to tweak.",
  },
  {
    kinds: ["payouts", "launch"],
    title: "Go live",
    text: "Connect payouts and publish when it feels right.",
  },
];

/** First landing on /setup: what's about to happen, and the pages already
 * being designed in the background. One orchestrated entrance. */
export function Welcome({
  flow,
  brandName,
  onStart,
}: {
  flow: SetupFlowState;
  brandName: string;
  onStart: () => void;
}) {
  const pages = flow.steps.filter((s) => s.kind === "page" && s.page_key);
  const statusOf = (key: string) => flow.page_builds[key]?.status ?? "idle";
  const ready = pages.filter(
    (p) => statusOf(p.page_key ?? "") === "ready",
  ).length;
  const started = pages.some((p) => statusOf(p.page_key ?? "") !== "idle");
  const parts = OVERVIEW.filter((o) =>
    flow.steps.some((s) => o.kinds.includes(s.kind)),
  );

  return (
    <div className="flex h-full overflow-y-auto px-5 py-6 sm:px-10 sm:py-8">
      <div className="m-auto w-full max-w-[640px]">
        <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] motion-safe:animate-[sf-rise_.6s_ease-out_both] sm:text-[56px]">
          Welcome, {brandName}.
        </h1>
        <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-[var(--sf-graphite)] motion-safe:animate-[sf-rise_.6s_.08s_ease-out_both]">
          Let’s build your site together. I draft everything — you approve,
          tweak, or just ask for changes. About ten minutes.
        </p>

        <ol className="mt-6 grid gap-3 border-t border-[var(--sf-line)] pt-5 motion-safe:animate-[sf-rise_.6s_.16s_ease-out_both] sm:mt-9 sm:grid-cols-3 sm:gap-6 sm:pt-6">
          {parts.map((p, i) => (
            <li key={p.title} className="flex gap-3 sm:block">
              <span className="text-sm font-semibold tabular-nums text-[var(--sf-brass)]">
                {i + 1}
              </span>
              <span className="block">
                <span className="block text-[15px] font-semibold sm:mt-2">
                  {p.title}
                </span>
                <span className="mt-1 hidden text-sm leading-relaxed text-[var(--sf-graphite)] sm:block">
                  {p.text}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {pages.length > 0 && (
          <section
            aria-live="polite"
            className="mt-6 rounded-2xl bg-white/80 p-4 shadow-[0_0_0_1px_var(--sf-line),0_10px_30px_-18px_rgb(48_36_20/0.3)] motion-safe:animate-[sf-rise_.6s_.24s_ease-out_both] sm:mt-8 sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full",
                    started
                      ? "bg-[var(--sf-brass)] motion-safe:animate-[sf-breathe_1.8s_ease-in-out_infinite]"
                      : "bg-[var(--sf-line-strong)]",
                  )}
                />
                {started
                  ? "While we talk, I’m designing your pages"
                  : "Your pages come next — I’ll design each one with you"}
              </p>
              {started && (
                <span className="shrink-0 text-xs tabular-nums text-[var(--sf-faint)]">
                  {ready} of {pages.length} ready
                </span>
              )}
            </div>
            <ul className="mt-3.5 flex flex-wrap gap-2">
              {pages.map((p) => {
                const st = statusOf(p.page_key ?? "");
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-500",
                      st === "ready"
                        ? "border-[var(--sf-line-strong)] bg-white text-[var(--sf-ink)]"
                        : st === "building"
                          ? "border-[var(--sf-line)] bg-white text-[var(--sf-graphite)]"
                          : "border-[var(--sf-line)] bg-transparent text-[var(--sf-faint)]",
                    )}
                  >
                    {st === "ready" ? (
                      <span className="flex size-3.5 items-center justify-center rounded-full bg-[var(--sf-ink)] text-white">
                        <Check
                          className="size-2.5"
                          strokeWidth={3.5}
                          aria-hidden
                        />
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          st === "building"
                            ? "bg-[var(--sf-brass)] motion-safe:animate-[sf-breathe_1.4s_ease-in-out_infinite]"
                            : "bg-[var(--sf-line-strong)]",
                        )}
                      />
                    )}
                    {p.title.replace(/ page$/i, "")}
                    <span className="sr-only">
                      {st === "ready"
                        ? "ready"
                        : st === "building"
                          ? "being designed"
                          : "not started"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="mt-7 motion-safe:animate-[sf-rise_.6s_.32s_ease-out_both] sm:mt-9">
          <Button size="lg" onClick={onStart} className="rounded-full px-8">
            Let’s start
          </Button>
        </div>
      </div>
    </div>
  );
}
