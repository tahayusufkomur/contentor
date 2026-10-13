"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { LockedMark } from "@/components/admin/feature-badges";
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
    <nav
      aria-label={section.label}
      className="flex items-center gap-1 overflow-x-auto border-b bg-card px-4"
    >
      {section.items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          className={({ active }) =>
            cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          <span>{item.label}</span>
          {item.external && (
            <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
          )}
          {item.requiresEntitlement && (
            <LockedMark feature={item.requiresEntitlement} />
          )}
        </NavLink>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => onExpand(section.id)}
          className="shrink-0 px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("nav.more", { count: hidden })}
        </button>
      )}
    </nav>
  );
}
