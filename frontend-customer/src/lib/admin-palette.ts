import { Mail, PlusCircle } from "lucide-react";

import type { NavSection } from "@/components/shared/app-sidebar";
import { KIND_ROUTES, type FocusKind } from "@/lib/focus/kinds";

export interface PaletteEntry {
  id: string;
  label: string;
  /** The section the page lives in, or the "create" group. */
  group: string;
  href: string;
  icon: NavSection["icon"];
  newTab?: boolean;
  /** Search-only names (a page's old name, a synonym); never displayed. */
  keywords?: string[];
}

/** What testers called these pages before the nav was renamed, plus a few
 *  synonyms. Search matches them; the visible name stays the one name. */
const OLD_NAMES: Record<string, string[]> = {
  home: ["dashboard", "overview"],
  liveEvents: [
    "live events",
    "live",
    "streams",
    "zoom",
    "calendar",
    "unified content calendar",
    "schedule",
  ],
  downloads: ["downloads & files", "files"],
  students: ["student crm", "enrollees", "crm"],
  messages: [
    "announcements",
    "send announcement",
    "alerts",
    "email",
    "email campaigns",
    "broadcasts",
    "newsletter",
  ],
  blog: ["blog posts", "articles"],
  store: ["products", "bundles", "memberships", "subscription plans"],
  design: ["theme", "branding", "colours", "colors", "logo", "fonts"],
  media: [
    "library",
    "photos",
    "photo library",
    "images",
    "videos",
    "video library",
    "recordings",
  ],
  assistant: ["site assistant", "ai site assistant", "chatbot"],
  settings: ["general settings", "timezone"],
  plan: ["billing", "subscription", "upgrade", "pricing"],
};

/** Search entries: two real creates (and one per other kind focus mode makes),
 *  then every page of the nav under the nav's own names. Built from the
 *  UNGATED nav on purpose — search still finds the pages of a module the
 *  coach has not turned on. */
export function paletteEntries(
  sections: NavSection[],
  t: (key: string) => string,
  focusKinds: FocusKind[] = [],
): PaletteEntry[] {
  const create = t("palette.create");
  return [
    {
      id: "create-course",
      label: t("palette.newCourse"),
      group: create,
      href: "/admin/courses/new",
      icon: PlusCircle,
    },
    {
      id: "create-message",
      label: t("palette.newMessage"),
      group: create,
      href: "/admin/messages/new",
      icon: Mail,
    },
    ...focusKinds.flatMap((kind) => {
      const routes = KIND_ROUTES[kind];
      return routes && kind !== "course" && kind !== "message"
        ? [
            {
              id: `create-${kind}`,
              label: t(`focus.kinds.${kind}.new`),
              group: create,
              href: routes.newHref,
              icon: PlusCircle,
            },
          ]
        : [];
    }),
    ...sections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.key,
        label: item.label,
        group: section.label,
        href: item.href,
        icon: item.icon,
        ...(item.external ? { newTab: true } : {}),
        ...(OLD_NAMES[item.key] ? { keywords: OLD_NAMES[item.key] } : {}),
      })),
    ),
  ];
}

export function filterPalette(
  entries: PaletteEntry[],
  query: string,
): PaletteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.group.toLowerCase().includes(q) ||
      !!e.keywords?.some((k) => k.includes(q)),
  );
}
