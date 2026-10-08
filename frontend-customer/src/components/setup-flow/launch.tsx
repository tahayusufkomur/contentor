"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";

/** After publishing: one orchestrated moment — rings, the live address,
 * the way to the site and to the admin panel. CSS-only and motion-safe. */
export function Celebration({
  brandName,
  host,
  onGo,
}: {
  brandName: string;
  host: string;
  onGo: (href: "/" | "/admin") => void;
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
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            onClick={() => onGo("/")}
            className="rounded-full px-8"
          >
            Go to your website
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => onGo("/admin")}
            className="rounded-full bg-white px-8"
          >
            Go to your admin panel
          </Button>
        </div>
      </div>
    </div>
  );
}
