"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { BLOCKERS } from "@/lib/setup-flow";

/** Launch step's bottom panel: what still blocks publishing, and the two
 * ways out. Replaces the regular action bar. */
export function LaunchPanel({
  blockers,
  stepIds,
  onFix,
  onPublish,
  onLater,
  publishing,
  leaving,
}: {
  blockers: string[];
  stepIds: string[];
  onFix: (step: string) => void;
  onPublish: () => void;
  onLater: () => void;
  publishing: boolean;
  leaving: boolean;
}) {
  const ready = blockers.length === 0;
  return (
    <div className="flex shrink-0 flex-col gap-4 border-t border-[var(--sf-line)] bg-[var(--sf-paper)] px-4 py-4 sm:px-6 md:flex-row md:items-end md:justify-between lg:mx-7 lg:mb-5 lg:mt-4 lg:rounded-2xl lg:border lg:bg-white lg:px-6 lg:py-5 lg:shadow-[0_1px_2px_rgb(20_22_28/0.05),0_12px_32px_-16px_rgb(20_22_28/0.2)]">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">
          {ready
            ? "Ready to open your doors"
            : "A few things before you publish"}
        </p>
        {ready ? (
          <p className="mt-1 text-sm text-[var(--sf-graphite)]">
            Everything is in place. Publishing makes your site visible to
            everyone.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {blockers.map((b) => {
              const info = BLOCKERS[b] ?? {
                label: b.replaceAll("_", " "),
                step: "",
              };
              return (
                <li key={b} className="flex items-center gap-3 text-sm">
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--sf-brass)]" />
                  <span className="min-w-0 truncate">{info.label}</span>
                  {stepIds.includes(info.step) && (
                    <button
                      type="button"
                      onClick={() => onFix(info.step)}
                      className="shrink-0 text-[13px] font-medium text-[var(--sf-brass)] underline-offset-4 hover:underline"
                    >
                      Fix
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <Button
          variant="ghost"
          onClick={onLater}
          loading={leaving}
          disabled={publishing}
          className="rounded-full"
        >
          Publish later — take me to my dashboard
        </Button>
        <Button
          size="lg"
          onClick={onPublish}
          loading={publishing}
          loadingText="Publishing…"
          disabled={!ready || leaving}
          className="rounded-full px-7"
        >
          Publish my site
        </Button>
      </div>
    </div>
  );
}

/** After publishing: one orchestrated moment — rings, the live address,
 * the way to the dashboard. CSS-only and motion-safe. */
export function Celebration({
  brandName,
  host,
  onDashboard,
}: {
  brandName: string;
  host: string;
  onDashboard: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden bg-[rgb(228_229_232/0.9)] px-6 backdrop-blur-md motion-safe:animate-fade-in">
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
      >
        {[0, 0.35, 0.7].map((delay) => (
          <span
            key={delay}
            className="absolute size-[360px] rounded-full border border-[var(--sf-brass)] opacity-0 motion-safe:animate-[sf-ring_2.4s_cubic-bezier(.2,.7,.2,1)_both]"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
      <div
        role="status"
        className="relative max-w-[520px] text-center motion-safe:animate-[sf-rise_.6s_.25s_ease-out_both]"
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--sf-ink)] text-white">
          <Check className="size-6" strokeWidth={2.5} aria-hidden />
        </span>
        <h2 className="mt-6 text-[36px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
          {brandName} is live
        </h2>
        <p className="mt-3 text-[15px] text-[var(--sf-graphite)]">
          Anyone can visit your site now. Share the address with your students.
        </p>
        <NavLink
          href="/"
          target="_blank"
          rel="noopener"
          className="mt-6 inline-flex max-w-full items-center rounded-full bg-white px-4 py-2 text-sm font-medium shadow-[0_0_0_1px_var(--sf-line)] transition-shadow hover:shadow-[0_0_0_1px_var(--sf-line-strong),0_4px_12px_-4px_rgb(20_22_28/0.15)]"
        >
          <span className="truncate">{host}</span>
        </NavLink>
        <div className="mt-8">
          <Button size="lg" onClick={onDashboard} className="rounded-full px-8">
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
