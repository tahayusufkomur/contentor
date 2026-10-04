/**
 * Gotcha: `cn()` (tailwind-merge) treats `text-5xl` as also setting
 * line-height, so a `leading-*` placed BEFORE a font-size class is dropped.
 * Put `leading-*` after the size class (or use `text-5xl/[1.02]`).
 *
 * Shared primitives for section layouts. Every style's sections build on
 * these so editing, images, links and prices behave identically everywhere —
 * styles differ in layout and look, never in behaviour.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InlineText } from "@/components/blocks/inline-text";
import { EditableBody } from "@/components/blocks/editable-body";
import { NavLink } from "@/components/ui/nav-link";
import { PriceBadge } from "@/components/billing/price-badge";
import { formatMoney } from "@/lib/format";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import type { Course } from "@/types/course";
import type { CalendarEvent } from "@/types/live";

type Tag = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";

/** A block text field. Public site: plain text, or nothing when empty. Edit
 *  mode: inline-editable (shows `placeholder` when empty). */
export function Txt({
  block,
  field,
  editable,
  as = "span",
  className,
  placeholder,
}: {
  block: Block;
  field: string;
  editable?: EditableContext;
  as?: Tag;
  className?: string;
  placeholder?: string;
}) {
  const value = typeof block[field] === "string" ? block[field] : "";
  if (!value && !editable) return null;
  return (
    <InlineText
      value={value}
      field={field}
      editable={editable}
      as={as}
      className={className}
      placeholder={placeholder ?? field}
    />
  );
}

/** True when a text field has content (use to skip wrappers around empty
 *  optional fields on the public site). In edit mode always true so the coach
 *  can fill it in. */
export function has(block: Block, field: string, editable?: EditableContext) {
  return Boolean(editable) || Boolean(block[field]);
}

/** A rich-text field (sanitized HTML; opens the rich-text modal in edit mode). */
export function Rich({
  block,
  field,
  editable,
  className,
}: {
  block: Block;
  field: string;
  editable?: EditableContext;
  className?: string;
}) {
  const value = typeof block[field] === "string" ? block[field] : "";
  if (!value && !editable) return null;
  return (
    <EditableBody
      value={value}
      field={field}
      editable={editable}
      className={cn("[&_p+p]:mt-4", className)}
    />
  );
}

export interface ImageValue {
  url?: string | null;
  photo_id?: string | null;
  alt?: string;
}

export function imageUrl(value: unknown): string | null {
  const v = value as ImageValue | undefined;
  return v && typeof v.url === "string" && v.url ? v.url : null;
}

/** A photo that is never broken: with no URL it renders a quiet tinted
 *  placeholder of the same box. Size the box with `className` (e.g.
 *  "aspect-[4/5] w-full"); the image covers it. */
export function Img({
  value,
  alt = "",
  className,
  imgClassName,
  priority,
}: {
  value: unknown;
  alt?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  const url = imageUrl(value);
  const label = (value as ImageValue | undefined)?.alt || alt;
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={cn("absolute inset-0 h-full w-full object-cover", imgClassName)}
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_60%),radial-gradient(ellipse_at_80%_90%,color-mix(in_oklch,var(--accent)_22%,transparent),transparent_55%)]"
        />
      )}
    </div>
  );
}

/** Internal hrefs ("/courses") use NavLink (drives the progress bar); anything
 *  else is a plain anchor. Empty href renders children without a link. */
export function SmartLink({
  href,
  className,
  children,
}: {
  href?: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (!href) return <span className={className}>{children}</span>;
  if (href.startsWith("/")) {
    return (
      <NavLink href={href} className={className}>
        {children}
      </NavLink>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

/** Items of a repeater field, always an array. */
export function itemsOf<T = Record<string, unknown>>(block: Block, field: string): T[] {
  const v = block[field];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const courseHref = (c: Course) => `/courses/${c.slug}`;
export const eventHref = (e: CalendarEvent) => `/calendar/${e.type}/${e.id}`;
export const courseImage = (c: Course) => c.thumbnail_signed_url || c.thumbnail_url || null;

/** Plain-text price in the tenant currency: "€49", "Free", "Included in
 *  membership", or "Owned" for a student who already has it. */
export function coursePriceLabel(course: Course): string {
  const a = course.access_info;
  if (a?.has_access && a.access_reason !== "free") return "Owned";
  const type = a?.pricing_type ?? course.pricing_type;
  if (type === "free") return "Free";
  if (type === "subscription") return "Included in membership";
  const price = a?.price ?? course.price;
  return price ? formatMoney(price, a?.currency || "USD") : "";
}

/** The course's price: a themed badge, or plain text with `plain`. */
export function CoursePrice({
  course,
  className,
  plain,
}: {
  course: Course;
  className?: string;
  plain?: boolean;
}) {
  if (plain) return <span className={className}>{coursePriceLabel(course)}</span>;
  return (
    <span className={className}>
      <PriceBadge
        accessInfo={course.access_info}
        price={course.price}
        pricingType={course.pricing_type}
      />
    </span>
  );
}

/** Shown by dynamic sections with no data yet: a dashed hint for the coach,
 *  nothing at all for visitors. */
export function EmptyHint({
  editable,
  title,
  text,
}: {
  editable?: EditableContext;
  title: string;
  text: string;
}) {
  if (!editable) return null;
  return (
    <div className="mx-auto max-w-xl rounded-[var(--radius)] border border-dashed border-border px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** "Free" or the event price in the tenant currency ("€25"). */
export function eventPriceLabel(e: CalendarEvent): string {
  if (e.pricing_type !== "paid" || !Number(e.price)) return "Free";
  return formatMoney(e.price, e.currency || "USD");
}

export function formatEventDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatEventTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export { ContactForm } from "@/components/blocks/contact-form";
export { SubscribeButton } from "@/components/billing/subscribe-button";
export { billingIntervalSuffix } from "@/lib/billing-interval";
