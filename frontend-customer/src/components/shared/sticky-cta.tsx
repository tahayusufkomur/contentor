"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { useTenant } from "@/hooks/use-tenant";
import { resolveHeaderCta } from "@/lib/header-cta";
import type { SiteMenu } from "@/lib/navbar";
import { stickyCtaVisible } from "@/lib/sticky-cta";
import { cn } from "@/lib/utils";

/** The phone's call to action: the header button again, pinned to the bottom
 * once the first screen is behind the visitor, and gone while the footer is
 * on screen. Phones only (the header button is always in view on a desktop).
 * Publishes its height as --sticky-cta-clearance so the assistant launcher
 * can ride above it. */
export function StickyCta({
  plansEnabled = true,
  menu,
}: {
  plansEnabled?: boolean;
  menu?: SiteMenu;
}) {
  const config = useTenant();
  const pathname = usePathname();
  const cta = resolveHeaderCta(config?.navbar_config?.cta, plansEnabled, menu);
  const href = cta?.href;
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!href) return;
    const footer = document.querySelector("footer[data-footer-layout]");
    let footerInView = false;
    const update = () =>
      setVisible(
        stickyCtaVisible({
          scrollY: window.scrollY,
          viewportHeight: window.innerHeight,
          footerInView,
        }),
      );
    const observer = footer
      ? new IntersectionObserver(([entry]) => {
          footerInView = entry.isIntersecting;
          update();
        })
      : null;
    if (footer) observer?.observe(footer);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [href]);

  const shown = visible && Boolean(cta) && pathname !== href;

  useEffect(() => {
    const bar = barRef.current;
    if (!shown || !bar) return;
    const root = document.documentElement;
    // 0 on a desktop, where the bar is display: none.
    root.style.setProperty("--sticky-cta-clearance", `${bar.offsetHeight}px`);
    return () => {
      root.style.removeProperty("--sticky-cta-clearance");
    };
  }, [shown]);

  if (!shown || !cta) return null;

  return (
    <div
      ref={barRef}
      data-sticky-cta
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md md:hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom motion-safe:duration-200"
    >
      <NavLink
        href={cta.href}
        className={cn(buttonVariants({ size: "lg" }), "w-full")}
      >
        {cta.text}
      </NavLink>
    </div>
  );
}
