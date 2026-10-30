"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { SpecialistFace } from "@/components/copilot/specialist-face";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import type { TeamLine } from "@/lib/setup-flow";

/** After publishing: one orchestrated moment: rings, the live address, the
 * team's hand-off, the way to the control panel and to the site. CSS-only and
 * motion-safe. */
export function Celebration({
  brandName,
  host,
  team,
  onGo,
}: {
  brandName: string;
  host: string;
  team: TeamLine[];
  onGo: (href: "/" | "/admin") => void;
}) {
  const t = useTranslations("admin");
  const s = useTranslations("admin.setupFlow");
  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-[rgb(228_229_232/0.9)] backdrop-blur-md motion-safe:animate-fade-in">
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
      {/* Scrolls inside itself when the hand-off is taller than the screen. */}
      <div className="relative flex h-full overflow-y-auto px-6 py-10">
        <div
          role="status"
          className="m-auto w-full max-w-[720px] text-center motion-safe:animate-[sf-rise_.6s_.25s_ease-out_both]"
        >
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--sf-ink)] text-white">
            <Check className="size-6" strokeWidth={2.5} aria-hidden />
          </span>
          <h2 className="mt-6 text-[36px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
            {s("launch.live", { brand: brandName })}
          </h2>
          <p className="mt-3 text-[15px] text-[var(--sf-graphite)]">
            {team.length > 0 ? s("launch.visitWithTeam") : s("launch.visit")}
          </p>
          <NavLink
            href="/"
            target="_blank"
            rel="noopener"
            className="mt-6 inline-flex max-w-full items-center rounded-full bg-white px-4 py-2 text-sm font-medium shadow-[0_0_0_1px_var(--sf-line)] transition-shadow hover:shadow-[0_0_0_1px_var(--sf-line-strong),0_4px_12px_-4px_rgb(20_22_28/0.15)]"
          >
            <span className="truncate">{host}</span>
          </NavLink>
          {team.length > 0 && (
            <ul className="mt-8 grid gap-3 text-left sm:grid-cols-2">
              {team.map(({ key, did, next }) => (
                <li
                  key={key}
                  className="rounded-xl border border-[var(--sf-line)] bg-white p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <SpecialistFace k={key} size="md" />
                    <p className="text-sm font-medium">
                      {t(`team.specialists.${key}.name`)}
                    </p>
                  </div>
                  <p className="mt-3 text-[14px] leading-relaxed">{did}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
                    {next}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              onClick={() => onGo("/admin")}
              className="rounded-full px-8"
            >
              {s("launch.toAdmin")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => onGo("/")}
              className="rounded-full bg-white px-8"
            >
              {s("launch.toSite")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
