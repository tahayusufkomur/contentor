"use client";

import { useState, type CSSProperties } from "react";
import {
  Facebook,
  Instagram,
  Link2,
  Linkedin,
  Menu,
  Monitor,
  Music2,
  Smartphone,
  Twitter,
  X,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import type { SiteStylePalette } from "@shared/sections/types";
import { headerNavLinks, visibleNavLinks } from "@/lib/navbar";
import { cn } from "@/lib/utils";

type Link = { label: string; href: string };

const SOCIAL_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  x: Twitter,
  twitter: Twitter,
  linkedin: Linkedin,
  tiktok: Music2,
};

/** The setup shell's neutrals, for a coach with no look yet. */
const PLAIN = {
  background: "var(--sf-paper)",
  surface: "#FFFFFF",
  foreground: "var(--sf-ink)",
  mutedForeground: "var(--sf-graphite)",
  primary: "var(--sf-ink)",
  primaryForeground: "var(--sf-paper)",
  border: "var(--sf-line)",
};

const Bar = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "block h-1.5 rounded-full bg-current opacity-[0.12]",
      className,
    )}
  />
);

/** A page's top as a small picture: the coach's own menu, name and header
 * button in each header preset, drawn in her look's colours. */
export function NavbarSketch({
  layout,
  brand,
  links,
  cta,
  socials,
  showSocial,
  transparent,
  keepPicked,
  colors,
}: {
  layout: string;
  brand: string;
  links: Link[];
  cta?: string;
  socials?: string[];
  showSocial?: boolean;
  transparent?: boolean;
  keepPicked?: boolean;
  colors?: SiteStylePalette;
}) {
  const c = colors ?? PLAIN;
  const menu = headerNavLinks(links, true, undefined, false, keepPicked).slice(
    0,
    5,
  );
  const half = Math.ceil(menu.length / 2);
  const socialList = showSocial
    ? socials?.length
      ? socials.slice(0, 3)
      : ["instagram"]
    : [];
  const name = (
    <span
      className="truncate text-[9px] font-bold"
      style={{ color: c.foreground }}
    >
      {brand || "Your name"}
    </span>
  );
  const items = (list: Link[], className = "") => (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      {list.map((l) => (
        <span
          key={l.href}
          className="truncate text-[7px]"
          style={{ color: c.mutedForeground }}
        >
          {l.label}
        </span>
      ))}
    </span>
  );
  const socialIcons = socialList.length > 0 && (
    <span className="flex shrink-0 items-center gap-1">
      {socialList.map((s) => {
        const Icon = SOCIAL_ICONS[s.toLowerCase()] ?? Link2;
        return (
          <Icon
            key={s}
            className="size-2.5"
            style={{ color: c.mutedForeground }}
          />
        );
      })}
    </span>
  );
  const button = cta ? (
    <span
      className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[6px] font-semibold"
      style={{ background: c.primary, color: c.primaryForeground }}
    >
      {cta}
    </span>
  ) : null;
  const signIn = (
    <span className="shrink-0 text-[7px]" style={{ color: c.mutedForeground }}>
      Sign in
    </span>
  );
  const burger = (
    <span className="flex shrink-0 flex-col gap-[2px]">
      {[0, 1, 2].map((n) => (
        <span
          key={n}
          className="block h-[1.5px] w-2.5 rounded"
          style={{ background: c.foreground }}
        />
      ))}
    </span>
  );
  const bar: CSSProperties =
    transparent && layout !== "pill"
      ? { background: "transparent", borderColor: "transparent" }
      : { background: c.surface, borderColor: c.border };
  const header =
    layout === "centered" ? (
      <span
        className="flex flex-col items-center gap-1.5 border-b px-3 py-2"
        style={bar}
      >
        <span className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <span />
          {name}
          <span className="flex items-center justify-end gap-1.5">
            {socialIcons}
            {button}
          </span>
        </span>
        {items(menu)}
      </span>
    ) : layout === "split" ? (
      <span
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-3 py-2.5"
        style={bar}
      >
        {items(menu.slice(0, half))}
        {name}
        <span className="flex min-w-0 items-center justify-end gap-1.5">
          {items(menu.slice(half))}
          {socialIcons}
          {button}
        </span>
      </span>
    ) : layout === "minimal" ? (
      <span
        className="flex items-center justify-between gap-2 border-b px-3 py-2.5"
        style={bar}
      >
        {name}
        <span className="flex items-center gap-1.5">
          {socialIcons}
          {button}
          {burger}
        </span>
      </span>
    ) : layout === "pill" ? (
      <span className="block px-4 pt-2">
        <span
          className="flex items-center justify-between gap-2 rounded-full border px-3 py-1.5 shadow-sm"
          style={bar}
        >
          {name}
          {items(menu, "justify-center")}
          <span className="flex items-center gap-1.5">
            {socialIcons}
            {signIn}
            {button}
          </span>
        </span>
      </span>
    ) : (
      /* classic: name left, menu in the middle, sign-in and button right */
      <span
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-3 py-2.5"
        style={bar}
      >
        {name}
        {items(menu)}
        <span className="flex items-center justify-end gap-1.5">
          {socialIcons}
          {signIn}
          {button}
        </span>
      </span>
    );
  return (
    <span
      aria-hidden
      className="flex aspect-[16/9] w-full flex-col overflow-hidden"
      style={{ background: c.background, color: c.foreground }}
    >
      {header}
      {/* The page under it: a headline, a line, a button. */}
      <span className="flex flex-1 flex-col items-start justify-center gap-2 px-6">
        <Bar className="w-1/2 opacity-30" />
        <Bar className="w-2/3" />
        <Bar className="w-1/3" />
      </span>
    </span>
  );
}

/** Interactive Desktop + Mobile & Menu preview of the coach's header over her
 * site's hero section, in her chosen look's colours. */
export function NavbarStudioPreview({
  layout,
  brand,
  headline,
  links,
  cta,
  socials,
  showSocial,
  transparent,
  colors,
}: {
  layout: string;
  brand: string;
  headline?: string;
  links: Link[];
  cta?: string;
  socials?: string[];
  showSocial?: boolean;
  transparent?: boolean;
  colors?: SiteStylePalette;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const c = colors ?? PLAIN;
  const half = Math.ceil(links.length / 2);
  const socialList = showSocial
    ? socials?.length
      ? socials
      : ["instagram", "youtube"]
    : [];
  const barStyle: CSSProperties =
    transparent && layout !== "pill"
      ? { background: "transparent", borderColor: "transparent" }
      : { background: c.surface, borderColor: c.border };

  const brandEl = (
    <span
      className="truncate text-sm font-bold tracking-tight"
      style={{ color: c.foreground }}
    >
      {brand || "Your Studio"}
    </span>
  );
  const navItems = (list: Link[], className = "") => (
    <span className={cn("flex flex-wrap items-center gap-4", className)}>
      {list.map((l) => (
        <span
          key={l.href}
          className="text-xs font-medium transition-opacity hover:opacity-80"
          style={{ color: c.mutedForeground }}
        >
          {l.label}
        </span>
      ))}
    </span>
  );
  const socialCluster = socialList.length > 0 && (
    <span className="flex items-center gap-1.5">
      {socialList.map((s) => {
        const Icon = SOCIAL_ICONS[s.toLowerCase()] ?? Link2;
        return (
          <span
            key={s}
            title={s}
            className="flex size-6 items-center justify-center rounded-md"
            style={{ color: c.mutedForeground }}
          >
            <Icon className="size-3.5" />
          </span>
        );
      })}
    </span>
  );
  const ctaBtn = cta ? (
    <span
      className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: c.primary, color: c.primaryForeground }}
    >
      {cta}
    </span>
  ) : null;
  const signInEl = (
    <span
      className="shrink-0 text-xs font-medium"
      style={{ color: c.mutedForeground }}
    >
      Sign In
    </span>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--sf-line)] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sf-line)] bg-[var(--sf-tint)] px-4 py-2.5">
        <span className="text-[12.5px] font-medium text-[var(--sf-graphite)]">
          Live header preview on your site
        </span>
        <div
          role="group"
          aria-label="Preview device"
          className="flex items-center gap-1 rounded-full border border-[var(--sf-line-strong)] bg-white p-0.5"
        >
          <button
            type="button"
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              device === "desktop"
                ? "bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                : "text-[var(--sf-graphite)] hover:text-[var(--sf-ink)]",
            )}
          >
            <Monitor className="size-3.5" />
            Desktop
          </button>
          <button
            type="button"
            aria-pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              device === "mobile"
                ? "bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                : "text-[var(--sf-graphite)] hover:text-[var(--sf-ink)]",
            )}
          >
            <Smartphone className="size-3.5" />
            Mobile + Menu
          </button>
        </div>
      </div>

      {device === "desktop" ? (
        <div
          className="flex min-h-[210px] flex-col"
          style={{ background: c.background, color: c.foreground }}
        >
          {layout === "centered" ? (
            <div
              className="flex flex-col items-center gap-2 border-b px-6 py-3"
              style={barStyle}
            >
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
                <span />
                {brandEl}
                <span className="flex items-center justify-end gap-2.5">
                  {socialCluster}
                  {signInEl}
                  {ctaBtn}
                </span>
              </div>
              {navItems(links, "justify-center")}
            </div>
          ) : layout === "split" ? (
            <div
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b px-6 py-3.5"
              style={barStyle}
            >
              {navItems(links.slice(0, half))}
              {brandEl}
              <span className="flex items-center justify-end gap-3">
                {navItems(links.slice(half))}
                {socialCluster}
                {signInEl}
                {ctaBtn}
              </span>
            </div>
          ) : layout === "minimal" ? (
            <div
              className="flex items-center justify-between gap-4 border-b px-6 py-3.5"
              style={barStyle}
            >
              {brandEl}
              <span className="flex items-center gap-2.5">
                {socialCluster}
                {ctaBtn}
                <span
                  className="flex size-8 items-center justify-center rounded-md"
                  style={{ color: c.foreground }}
                >
                  <Menu className="size-4" />
                </span>
              </span>
            </div>
          ) : layout === "pill" ? (
            <div className="px-6 pt-3">
              <div
                className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-full border px-5 py-2.5 shadow-md"
                style={barStyle}
              >
                {brandEl}
                {navItems(links, "justify-center")}
                <span className="flex items-center gap-2.5">
                  {socialCluster}
                  {signInEl}
                  {ctaBtn}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b px-6 py-3.5"
              style={barStyle}
            >
              {brandEl}
              {navItems(links, "justify-center")}
              <span className="flex items-center justify-end gap-2.5">
                {socialCluster}
                {signInEl}
                {ctaBtn}
              </span>
            </div>
          )}

          <div className="flex flex-1 flex-col items-start justify-center gap-2.5 px-8 py-7">
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-75"
              style={{
                background: c.surface,
                color: c.mutedForeground,
                border: `1px solid ${c.border}`,
              }}
            >
              {brand || "Your site"}
            </span>
            <p className="max-w-lg text-lg font-semibold leading-snug">
              {headline || `Welcome to ${brand || "your new site"}`}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold"
                style={{ background: c.primary, color: c.primaryForeground }}
              >
                {cta || "Explore"}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center bg-[var(--sf-tint)] p-4">
          <div
            className="w-full max-w-[320px] overflow-hidden rounded-2xl border shadow-md"
            style={{
              background: c.background,
              color: c.foreground,
              borderColor: c.border,
            }}
          >
            <div
              className={cn(
                "flex items-center justify-between px-4 py-3",
                layout === "pill"
                  ? "m-2 rounded-full border shadow-sm"
                  : "border-b",
              )}
              style={barStyle}
            >
              {brandEl}
              <button
                type="button"
                onClick={() => setDrawerOpen((o) => !o)}
                aria-label="Toggle mobile menu preview"
                className="flex size-7 items-center justify-center rounded-md"
                style={{ color: c.foreground }}
              >
                {drawerOpen ? (
                  <X className="size-4" />
                ) : (
                  <Menu className="size-4" />
                )}
              </button>
            </div>
            {drawerOpen && (
              <div
                className="flex flex-col gap-2.5 border-b px-4 py-3.5"
                style={{ background: c.surface, borderColor: c.border }}
              >
                {links.length > 0 ? (
                  links.map((l) => (
                    <span
                      key={l.href}
                      className="text-xs font-medium"
                      style={{ color: c.foreground }}
                    >
                      {l.label}
                    </span>
                  ))
                ) : (
                  <span
                    className="text-xs italic"
                    style={{ color: c.mutedForeground }}
                  >
                    No menu links selected
                  </span>
                )}
                <div
                  className="mt-1 flex flex-col gap-1.5 border-t pt-2.5"
                  style={{ borderColor: c.border }}
                >
                  <span
                    className="py-1 text-center text-xs font-medium"
                    style={{ color: c.mutedForeground }}
                  >
                    Sign In
                  </span>
                  {cta && (
                    <span
                      className="rounded-lg py-1.5 text-center text-xs font-semibold"
                      style={{
                        background: c.primary,
                        color: c.primaryForeground,
                      }}
                    >
                      {cta}
                    </span>
                  )}
                </div>
                {socialCluster && <div className="pt-1">{socialCluster}</div>}
              </div>
            )}
            <div className="px-4 py-5">
              <p className="text-sm font-semibold leading-snug">
                {headline || `Welcome to ${brand || "your new site"}`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A page's bottom as a small picture: the coach's name, menu and social
 * accounts in each footer preset, drawn in her look's colours. */
export function FooterSketch({
  layout,
  brand,
  links,
  socials,
  colors,
}: {
  layout: string;
  brand: string;
  links: Link[];
  socials: string[];
  colors?: SiteStylePalette;
}) {
  const c = colors ?? PLAIN;
  const menu = visibleNavLinks(links, true).slice(0, 5);
  const year = new Date().getFullYear();
  const name = (
    <span
      className="truncate text-[9px] font-bold"
      style={{ color: c.foreground }}
    >
      {brand || "Your name"}
    </span>
  );
  const copyright = (
    <span
      className="truncate text-[6.5px]"
      style={{ color: c.mutedForeground }}
    >
      © {year} {brand || "Your name"}
    </span>
  );
  const items = (list: string[], column = false, className = "") => (
    <span
      className={cn(
        "flex min-w-0 gap-x-2 gap-y-1",
        column ? "flex-col" : "flex-wrap items-center",
        className,
      )}
    >
      {list.map((l) => (
        <span
          key={l}
          className="truncate text-[6.5px] capitalize"
          style={{ color: c.mutedForeground }}
        >
          {l}
        </span>
      ))}
    </span>
  );
  const labels = menu.map((l) => l.label);
  const heading = (text: string) => (
    <span
      className="mb-1 block text-[5.5px] font-semibold uppercase tracking-wide"
      style={{ color: c.foreground }}
    >
      {text}
    </span>
  );
  const border: CSSProperties = { borderColor: c.border };
  const footer =
    layout === "columns" ? (
      <span className="block border-t" style={border}>
        <span className="grid grid-cols-[1.5fr_1fr_1fr] gap-3 px-4 pb-2 pt-3">
          <span className="flex flex-col gap-1">
            {name}
            <Bar className="w-5/6" />
            <Bar className="w-3/5" />
          </span>
          <span>
            {heading("Pages")}
            {items(labels, true)}
          </span>
          <span>
            {heading("Follow")}
            {items(socials.length ? socials : ["Instagram"], true)}
          </span>
        </span>
        <span className="block border-t px-4 py-1.5" style={border}>
          {copyright}
        </span>
      </span>
    ) : layout === "centered" ? (
      <span
        className="flex flex-col items-center gap-1.5 border-t px-4 py-3 text-center"
        style={border}
      >
        {name}
        {items(labels, false, "justify-center")}
        {items(socials, false, "justify-center")}
        {copyright}
      </span>
    ) : layout === "minimal" ? (
      <span
        className="flex items-center justify-between border-t px-4 py-2"
        style={border}
      >
        {copyright}
      </span>
    ) : (
      /* simple: one row */
      <span
        className="flex items-center justify-between gap-2 border-t px-4 py-2.5"
        style={border}
      >
        {copyright}
        {items(labels)}
        {items(socials)}
      </span>
    );
  return (
    <span
      aria-hidden
      className="flex aspect-[16/9] w-full flex-col justify-end overflow-hidden"
      style={{ background: c.background, color: c.foreground }}
    >
      {/* The page above it: the last section's lines. */}
      <span className="flex flex-col items-start gap-2 px-6 pb-4">
        <Bar className="w-1/2 opacity-30" />
        <Bar className="w-2/3" />
      </span>
      {footer}
    </span>
  );
}
