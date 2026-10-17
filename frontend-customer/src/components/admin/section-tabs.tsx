"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import type { NavSection } from "@/components/shared/app-sidebar";
import { NavLink } from "@/components/ui/nav-link";
import { cn } from "@/lib/utils";

/** The pages of the section the coach is in, as tabs under the top bar.
 *  Renders nothing for a single-page section with nothing hidden. */
export function SectionTabs({
  section,
  onExpand,
}: {
  section: NavSection | undefined;
  onExpand: (sectionId: string) => void;
}) {
  const t = useTranslations("admin");
  if (!section) return null;
  const hidden = section.hiddenCount ?? 0;
  if (section.items.length < 2 && hidden === 0) return null;

  return (
    // The <nav> keeps the section's name: e2e finds the strip as
    // getByRole("navigation", { name: section.label }).
    <nav
      aria-label={section.label}
      className="flex items-center overflow-x-auto border-b bg-background px-4 py-2"
    >
      {/* Segmented control on second paper; the active page is an ink pill */}
      <div className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-muted p-1">
        {section.items.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            className={({ active }) =>
              cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <span>{item.label}</span>
            {item.external && (
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            )}
          </NavLink>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => onExpand(section.id)}
            className="h-7 shrink-0 rounded-full px-3 text-caption text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("nav.more", { count: hidden })}
          </button>
        )}
      </div>
    </nav>
  );
}
