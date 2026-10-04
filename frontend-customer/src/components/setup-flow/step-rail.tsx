"use client";

import { Check, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_GROUPS, type SetupStep } from "@/lib/setup-flow";

export function progressOf(steps: SetupStep[]) {
  const settled = steps.filter(
    (s) => s.state === "done" || s.state === "skipped",
  ).length;
  return { settled, total: steps.length, pct: (settled / steps.length) * 100 };
}

function Brand({ name, logoUrl }: { name: string; logoUrl: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="size-8 shrink-0 rounded-lg border border-[var(--sf-line)] bg-white object-contain p-0.5"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sf-ink)] text-sm font-semibold text-[var(--sf-paper)]"
        >
          {name.trim().charAt(0).toUpperCase() || "·"}
        </span>
      )}
      <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
        {name}
      </span>
    </span>
  );
}

function ProgressLine({ pct }: { pct: number }) {
  return (
    <span className="block h-[3px] overflow-hidden rounded-full bg-[var(--sf-line)]">
      <span
        className="block h-full rounded-full bg-[var(--sf-brass)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(pct, 3)}%` }}
      />
    </span>
  );
}

function Marker({ state }: { state: SetupStep["state"] }) {
  if (state === "done") {
    return (
      <span className="flex size-[18px] items-center justify-center rounded-full bg-[var(--sf-ink)] text-[var(--sf-paper)]">
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-[var(--sf-brass)] bg-[var(--sf-paper)]">
        <span className="size-2 rounded-full bg-[var(--sf-brass)]" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "block size-[18px] rounded-full border-[1.5px] bg-[var(--sf-paper)]",
        state === "skipped"
          ? "border-dashed border-[var(--sf-faint)]"
          : "border-[var(--sf-line-strong)]",
      )}
    />
  );
}

/** Desktop left rail: brand, overall progress, grouped vertical stepper. */
export function StepRail({
  steps,
  brandName,
  logoUrl,
  onGoto,
  busy,
}: {
  steps: SetupStep[];
  brandName: string;
  logoUrl: string;
  onGoto: (id: string) => void;
  busy: boolean;
}) {
  const { settled, total, pct } = progressOf(steps);
  return (
    <aside className="hidden w-[280px] shrink-0 flex-col border-r border-[var(--sf-line)] bg-[var(--sf-paper)] lg:flex">
      <div className="px-6 pb-5 pt-6">
        <Brand name={brandName} logoUrl={logoUrl} />
        <p className="mt-6 text-[13px] text-[var(--sf-graphite)]">
          Setting up your site
        </p>
        <div className="mt-2.5">
          <ProgressLine pct={pct} />
        </div>
        <p className="mt-2 text-xs tabular-nums text-[var(--sf-faint)]">
          {settled} of {total} steps finished
        </p>
      </div>

      <nav
        aria-label="Setup steps"
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
      >
        {STEP_GROUPS.map((group) => {
          const items = steps.filter((s) => group.kinds.includes(s.kind));
          if (items.length === 0) return null;
          return (
            <section key={group.label} className="mt-3 first:mt-0">
              <h2 className="px-3 pb-1.5 pt-2 text-xs font-medium text-[var(--sf-faint)]">
                {group.label}
              </h2>
              <ol className="relative before:absolute before:bottom-4 before:left-[20.5px] before:top-4 before:w-px before:bg-[var(--sf-line)]">
                {items.map((s) => {
                  const active = s.state === "active";
                  return (
                    <li key={s.id} className="relative">
                      <button
                        type="button"
                        disabled={active || busy}
                        aria-current={active ? "step" : undefined}
                        onClick={() => onGoto(s.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[rgb(154_119_58/0.35)]",
                          active
                            ? "bg-white font-medium text-[var(--sf-ink)] shadow-[0_0_0_1px_var(--sf-line),0_1px_2px_rgb(48_36_20/0.06)]"
                            : "hover:bg-[var(--sf-tint)] disabled:cursor-default",
                          s.state === "done" && "text-[var(--sf-ink)]",
                          s.state === "todo" && "text-[var(--sf-graphite)]",
                          s.state === "skipped" && "text-[var(--sf-faint)]",
                        )}
                      >
                        <span className="relative z-10 shrink-0">
                          <Marker state={s.state} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {s.title}
                        </span>
                        {s.state === "skipped" && (
                          <span className="text-xs">Skipped</span>
                        )}
                        {s.state === "todo" && s.optional && (
                          <span className="text-xs text-[var(--sf-faint)]">
                            Optional
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </nav>

      <p className="flex gap-2 border-t border-[var(--sf-line)] px-6 py-4 text-xs leading-relaxed text-[var(--sf-graphite)]">
        <MessageCircle
          className="mt-0.5 size-3.5 shrink-0 text-[var(--sf-faint)]"
          aria-hidden
        />
        <span>
          Need help? Ask the assistant on the right. It can change anything you
          see.
        </span>
      </p>
    </aside>
  );
}

/** Below 1024px: brand + step counter, progress line, Preview/Chat switch. */
export function MobileHeader({
  steps,
  brandName,
  logoUrl,
  activeTitle,
  tab,
  onTab,
}: {
  steps: SetupStep[];
  brandName: string;
  logoUrl: string;
  activeTitle: string;
  tab: "preview" | "chat";
  onTab: (t: "preview" | "chat") => void;
}) {
  const { pct } = progressOf(steps);
  const index = steps.findIndex((s) => s.state === "active");
  return (
    <header className="shrink-0 border-b border-[var(--sf-line)] bg-[var(--sf-paper)] px-4 pb-3 pt-3 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <Brand name={brandName} logoUrl={logoUrl} />
        <span className="shrink-0 text-xs tabular-nums text-[var(--sf-graphite)]">
          Step {index + 1} of {steps.length}
        </span>
      </div>
      <div className="mt-3">
        <ProgressLine pct={pct} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{activeTitle}</p>
        <div
          role="tablist"
          aria-label="View"
          className="flex shrink-0 rounded-full bg-[var(--sf-tint-strong)] p-0.5 text-xs font-medium"
        >
          {(["preview", "chat"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => onTab(t)}
              className={cn(
                "rounded-full px-3.5 py-1.5 capitalize transition-colors",
                tab === t
                  ? "bg-white text-[var(--sf-ink)] shadow-[0_1px_2px_rgb(48_36_20/0.12)]"
                  : "text-[var(--sf-graphite)]",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
