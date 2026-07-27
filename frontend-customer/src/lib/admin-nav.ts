import {
  Bell,
  BookOpen,
  Calendar,
  CreditCard,
  Download,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageCircleQuestion,
  MessagesSquare,
  Newspaper,
  Palette,
  Pencil,
  Settings,
  Sparkles,
  Store,
  Users,
  Video,
  Wallet,
} from "lucide-react";

import type { NavSection } from "@/components/shared/app-sidebar";

/** The coach admin's information architecture: seven job-stage destinations.
 *  Single source of truth for both the desktop sidebar and the mobile drawer.
 *  Pure — takes a next-intl translator and returns data, so it is unit-tested
 *  without React. See lib/__tests__/admin-nav.test.ts. */
export function buildAdminNav(t: (key: string) => string): NavSection[] {
  return [
    {
      id: "home",
      label: t("nav.items.home"),
      flat: true,
      items: [
        { label: t("nav.items.home"), href: "/admin", icon: LayoutDashboard },
      ],
    },
    {
      id: "content",
      label: t("nav.sections.content"),
      items: [
        {
          label: t("nav.items.courses"),
          href: "/admin/courses",
          icon: BookOpen,
        },
        {
          label: t("nav.items.liveEvents"),
          href: "/admin/live",
          icon: Video,
          requiresEntitlement: "live",
          partialPaid: true,
        },
        {
          label: t("nav.items.calendar"),
          href: "/admin/calendar",
          icon: Calendar,
        },
        {
          label: t("nav.items.downloads"),
          href: "/admin/downloads",
          icon: Download,
        },
        {
          label: t("nav.items.library"),
          href: "/admin/photos",
          icon: ImageIcon,
        },
      ],
    },
    {
      id: "mySite",
      label: t("nav.sections.mySite"),
      items: [
        {
          label: t("nav.items.siteAi"),
          href: "/admin/site-ai",
          icon: Sparkles,
          ai: true,
          requiresEntitlement: "site_ai",
          partialPaid: true,
        },
        {
          label: t("nav.items.editSite"),
          href: "/?edit=1",
          icon: Pencil,
          external: true,
        },
        {
          // Design settings live in the site editor's Site → Brand section —
          // there is no standalone /admin/design page any more.
          label: t("nav.items.design"),
          href: "/?edit=1&section=brand",
          icon: Palette,
          external: true,
          ai: true,
          requiresEntitlement: "logo_studio",
          partialPaid: true,
        },
        {
          label: t("nav.items.assistant"),
          href: "/admin/assistant",
          icon: MessageCircleQuestion,
          ai: true,
          requiresEntitlement: "student_bot",
        },
      ],
    },
    {
      id: "audience",
      label: t("nav.sections.audience"),
      items: [
        {
          label: t("nav.items.students"),
          href: "/admin/students",
          icon: Users,
        },
        {
          label: t("nav.items.communityFeed"),
          href: "/admin/community",
          icon: MessagesSquare,
        },
        {
          label: t("nav.items.inbox"),
          href: "/admin/inbox",
          icon: Inbox,
          requiresEntitlement: "platform_mailbox",
          partialPaid: true,
        },
      ],
    },
    {
      id: "marketing",
      label: t("nav.sections.marketing"),
      items: [
        {
          label: t("nav.items.blog"),
          href: "/admin/blog",
          icon: Newspaper,
          ai: true,
          requiresEntitlement: "ai_blog",
          partialPaid: true,
        },
        { label: t("nav.items.email"), href: "/admin/email", icon: Mail },
        {
          label: t("nav.items.notifications"),
          href: "/admin/notifications",
          icon: Bell,
        },
      ],
    },
    {
      id: "money",
      label: t("nav.sections.money"),
      items: [
        {
          label: t("nav.items.payouts"),
          href: "/admin/payouts",
          icon: Wallet,
          requiresEntitlement: "payouts",
        },
        {
          // Coach's own subscription to Contentor (payment to us).
          label: t("nav.items.billing"),
          href: "/admin/billing",
          icon: CreditCard,
        },
        {
          // Selling to students — products, bundles, subscription plans.
          // Deep-links into the billing page's product tabs; paid-plan gated.
          label: t("nav.items.store"),
          href: "/admin/billing?tab=products",
          icon: Store,
          requiresEntitlement: "selling",
        },
      ],
    },
    {
      id: "settings",
      label: t("nav.items.settings"),
      flat: true,
      items: [
        {
          label: t("nav.items.settings"),
          href: "/admin/settings",
          icon: Settings,
        },
      ],
    },
  ];
}
