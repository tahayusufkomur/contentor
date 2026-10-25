import {
  Bell,
  BookOpen,
  Clapperboard,
  CreditCard,
  Download,
  Globe,
  Image as ImageIcon,
  Images,
  Inbox,
  LayoutDashboard,
  MessageCircleQuestion,
  MessagesSquare,
  Newspaper,
  Palette,
  Pencil,
  Settings,
  SlidersHorizontal,
  Store,
  Users,
  Video,
  Wallet,
} from "lucide-react";

import type { NavSection } from "@/components/shared/app-sidebar";
import {
  isNavItemActive,
  type NavPathState,
} from "@shared/navigation/navigation-state";

/** The coach admin's information architecture: seven places, each holding the
 *  pages of one job. Single source for the sidebar, the section tabs, the
 *  phone drawer and the search. Pure — see lib/__tests__/admin-nav.test.ts. */
export function buildAdminNav(t: (key: string) => string): NavSection[] {
  const item = (
    key: string,
    href: string,
    icon: NavSection["icon"],
    extra: Partial<NavSection["items"][number]> = {},
  ) => ({ key, label: t(`nav.items.${key}`), href, icon, ...extra });

  return [
    {
      id: "home",
      label: t("nav.items.home"),
      icon: LayoutDashboard,
      items: [item("home", "/admin", LayoutDashboard)],
    },
    {
      id: "teach",
      label: t("nav.sections.teach"),
      icon: BookOpen,
      items: [
        item("courses", "/admin/courses", BookOpen),
        item("liveEvents", "/admin/live", Video),
        item("downloads", "/admin/downloads", Download),
      ],
    },
    {
      id: "students",
      label: t("nav.sections.students"),
      icon: Users,
      items: [
        item("students", "/admin/students", Users),
        item("communityFeed", "/admin/community", MessagesSquare),
        item("inbox", "/admin/inbox", Inbox),
      ],
    },
    {
      id: "reachOut",
      label: t("nav.sections.reachOut"),
      icon: Bell,
      items: [
        item("messages", "/admin/messages", Bell),
        item("blog", "/admin/blog", Newspaper),
        item("reels", "/admin/reels", Clapperboard),
      ],
    },
    {
      id: "money",
      label: t("nav.sections.money"),
      icon: Wallet,
      items: [
        item("payouts", "/admin/payouts", Wallet),
        item("store", "/admin/store", Store),
      ],
    },
    {
      id: "site",
      label: t("nav.sections.site"),
      icon: Globe,
      items: [
        item("editSite", "/?edit=1", Pencil, { external: true }),
        item("design", "/?edit=1&section=brand", Palette, {
          external: true,
        }),
        item("media", "/admin/media", ImageIcon),
        item("studio", "/admin/studio", Images),
        item("assistant", "/admin/assistant", MessageCircleQuestion),
      ],
    },
    {
      id: "settings",
      label: t("nav.sections.settings"),
      icon: Settings,
      items: [
        item("settings", "/admin/settings", SlidersHorizontal),
        item("plan", "/admin/billing", CreditCard),
      ],
    },
  ];
}

/** Where a section's sidebar row leads: its first page inside the admin. */
export function sectionHref(section: NavSection): string {
  return (section.items.find((i) => !i.external) ?? section.items[0]).href;
}

/** The section the coach is in, from her current (or pending) path. Detail
 *  pages count through the prefix match: /admin/courses/new is Teach. */
export function activeSection(
  sections: NavSection[],
  state: NavPathState,
): NavSection | undefined {
  return sections.find((section) =>
    section.items.some((i) => !i.external && isNavItemActive(state, i.href)),
  );
}
