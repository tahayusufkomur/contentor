"use client";

import Link from "next/link";

import { ContentorBadge } from "@shared/ui/contentor-brand";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useTenant } from "@/hooks/use-tenant";
import { visibleNavLinks, type SiteMenu } from "@/lib/navbar";
import type { FooterLayout } from "@/types/tenant";
import { cn } from "@/lib/utils";

const VALID_LAYOUTS: ReadonlySet<string> = new Set([
  "simple",
  "columns",
  "centered",
  "minimal",
]);

/** The footer preset to render: unknown or missing is "simple" (the one
 * every tenant had before the setup interview asked). */
export function footerLayout(raw: string | undefined | null): FooterLayout {
  return raw && VALID_LAYOUTS.has(raw) ? (raw as FooterLayout) : "simple";
}

const WRAP =
  "mx-auto max-w-[var(--site-wrap,80rem)] px-[var(--site-gutter,1rem)] md:px-[var(--site-gutter-md,1.5rem)]";
const LINK = "transition-colors hover:text-foreground";

/** Brand, © year, the site's own nav links and any social links the coach
 * set, the light/dark toggle and the platform badge, in the arrangement picked
 * in /setup (navbar_config.footer_layout). A public site that ends at the last
 * block reads as unfinished. */
export function PublicFooter({
  plansEnabled = true,
  menu,
}: {
  plansEnabled?: boolean;
  menu?: SiteMenu;
} = {}) {
  const config = useTenant();
  if (!config) return null;
  const layout = footerLayout(config.navbar_config?.footer_layout);
  const links = visibleNavLinks(
    config.navbar_config?.links ?? [],
    plansEnabled,
    menu,
  );
  const social = Object.entries(config.social_links ?? {}).filter(
    ([, url]) => url,
  );
  const column = layout === "columns";

  const copyright = (
    <p>
      © {new Date().getFullYear()} {config.brand_name}
    </p>
  );
  const nav = links.length > 0 && (
    <nav
      aria-label="Footer"
      className={cn(
        "flex gap-x-5 gap-y-2",
        column ? "flex-col" : "flex-wrap",
        layout === "centered" && "justify-center",
      )}
    >
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={LINK}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
  const socials = social.length > 0 && (
    <ul
      className={cn(
        "flex gap-x-4 gap-y-2",
        column ? "flex-col" : "flex-wrap",
        layout === "centered" && "justify-center",
      )}
    >
      {social.map(([name, url]) => (
        <li key={name}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("capitalize", LINK)}
          >
            {name}
          </a>
        </li>
      ))}
    </ul>
  );
  // The site's one light/dark choice (next-themes key "theme"), shared with the admin.
  const toggle = config.dark_mode_enabled !== false && (
    <ThemeToggle
      className={cn(
        "w-auto font-normal text-muted-foreground",
        // Its padding would indent it from the links above it on a phone.
        layout !== "centered" && "-ml-3 md:ml-0",
      )}
    />
  );
  // The platform's mark stays, but quiet: no outline, smaller, muted name.
  const badge = config.show_badge && (
    <ContentorBadge className="gap-1.5 border-transparent px-2 py-1 [&_span>span]:font-medium [&_span>span]:text-muted-foreground" />
  );
  const tail = (toggle || badge) && (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2",
        layout === "centered" && "justify-center",
      )}
    >
      {toggle}
      {badge}
    </div>
  );

  return (
    <footer
      data-footer-layout={layout}
      className="border-t text-sm text-muted-foreground"
    >
      {layout === "columns" ? (
        <>
          <div
            className={`${WRAP} grid gap-8 py-12 md:grid-cols-[1.5fr_1fr_1fr]`}
          >
            <div>
              <p className="font-display text-lg font-bold text-foreground">
                {config.brand_name}
              </p>
              {config.meta_description && (
                <p className="mt-2 max-w-xs">{config.meta_description}</p>
              )}
            </div>
            {nav && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground">
                  Pages
                </p>
                {nav}
              </div>
            )}
            {socials && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground">
                  Follow
                </p>
                {socials}
              </div>
            )}
          </div>
          <div
            className={`${WRAP} flex flex-col gap-3 border-t py-4 text-xs md:flex-row md:items-center md:justify-between`}
          >
            {copyright}
            {tail}
          </div>
        </>
      ) : layout === "centered" ? (
        <div
          className={`${WRAP} flex flex-col items-center gap-4 py-10 text-center`}
        >
          <p className="font-display text-lg font-bold text-foreground">
            {config.brand_name}
          </p>
          {nav}
          {socials}
          {copyright}
          {tail}
        </div>
      ) : layout === "minimal" ? (
        <div
          className={`${WRAP} flex flex-col gap-3 py-6 md:flex-row md:items-center md:justify-between`}
        >
          {copyright}
          {socials}
          {tail}
        </div>
      ) : (
        /* simple — one row: ©, the menu, the social links, the toggle and badge */
        <div
          className={`${WRAP} flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between`}
        >
          {copyright}
          {nav}
          {socials}
          {tail}
        </div>
      )}
    </footer>
  );
}
