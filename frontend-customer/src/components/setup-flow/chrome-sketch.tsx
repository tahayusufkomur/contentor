"use client";

import type { CSSProperties } from "react";
import type { SiteStylePalette } from "@shared/sections/types";
import { headerNavLinks, visibleNavLinks } from "@/lib/navbar";
import { cn } from "@/lib/utils";

type Link = { label: string; href: string };

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
  colors,
}: {
  layout: string;
  brand: string;
  links: Link[];
  cta?: string;
  colors?: SiteStylePalette;
}) {
  const c = colors ?? PLAIN;
  const menu = headerNavLinks(links, true).slice(0, 5);
  const half = Math.ceil(menu.length / 2);
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
  const bar: CSSProperties = { background: c.surface, borderColor: c.border };
  const header =
    layout === "centered" ? (
      <span
        className="flex flex-col items-center gap-1.5 border-b px-3 py-2"
        style={bar}
      >
        {name}
        {items(menu)}
      </span>
    ) : layout === "split" ? (
      <span
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-3 py-2.5"
        style={bar}
      >
        {items(menu.slice(0, half))}
        {name}
        <span className="flex min-w-0 items-center justify-end gap-2">
          {items(menu.slice(half))}
          {button}
        </span>
      </span>
    ) : layout === "minimal" ? (
      <span
        className="flex items-center justify-between gap-2 border-b px-3 py-2.5"
        style={bar}
      >
        {name}
        <span className="flex items-center gap-2">
          {button}
          {burger}
        </span>
      </span>
    ) : layout === "pill" ? (
      <span className="block px-5 pt-2">
        <span
          className="flex items-center justify-between gap-2 rounded-full border px-3 py-1.5 shadow-sm"
          style={bar}
        >
          {name}
          {items(menu, "justify-center")}
          <span className="flex items-center gap-1.5">
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
