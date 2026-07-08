"use client";

import {
  Bell,
  BookOpen,
  CreditCard,
  Database,
  Download,
  Film,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  Palette,
  FileText,
  Settings,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { AppSidebar } from "@/components/shared/app-sidebar";
import { ImpersonationBanner } from "@/components/shared/impersonation-banner";
import { MobileHeader } from "@/components/shared/mobile-header";
import { UserMenu } from "@/components/shared/user-menu";
import { SetupAssistantBubble } from "@/components/setup/setup-assistant-bubble";
import type { NavSection } from "@/components/shared/app-sidebar";
import type { User } from "@/types/auth";

interface AdminShellProps {
  children: React.ReactNode;
  user?: User | null;
}

export function AdminShell({ children, user }: AdminShellProps) {
  const t = useTranslations("admin");

  const navSections: NavSection[] = [
    {
      id: "overview",
      label: t("nav.sections.overview"),
      items: [
        {
          label: t("nav.items.dashboard"),
          href: "/admin",
          icon: LayoutDashboard,
        },
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
          label: t("nav.items.photos"),
          href: "/admin/photos",
          icon: ImageIcon,
        },
        { label: t("nav.items.videos"), href: "/admin/videos", icon: Film },
        {
          label: t("nav.items.downloads"),
          href: "/admin/downloads",
          icon: Download,
        },
        { label: t("nav.items.liveEvents"), href: "/admin/live", icon: Video },
        { label: t("nav.items.email"), href: "/admin/email", icon: Mail },
      ],
    },
    {
      id: "community",
      label: t("nav.sections.community"),
      items: [
        {
          label: t("nav.items.communityFeed"),
          href: "/admin/community",
          icon: MessagesSquare,
        },
        {
          label: t("nav.items.students"),
          href: "/admin/students",
          icon: Users,
        },
        {
          label: t("nav.items.notifications"),
          href: "/admin/notifications",
          icon: Bell,
        },
        { label: t("nav.items.inbox"), href: "/admin/inbox", icon: Inbox },
      ],
    },
    {
      id: "site",
      label: t("nav.sections.site"),
      items: [
        { label: t("nav.items.pages"), href: "/admin/pages", icon: FileText },
        { label: t("nav.items.design"), href: "/admin/design", icon: Palette },
        {
          label: t("nav.items.settings"),
          href: "/admin/settings",
          icon: Settings,
        },
      ],
    },
    {
      id: "business",
      label: t("nav.sections.business"),
      items: [
        {
          label: t("nav.items.billing"),
          href: "/admin/billing",
          icon: CreditCard,
        },
        { label: t("nav.items.payouts"), href: "/admin/payouts", icon: Wallet },
        // Schema-driven admin kit: model labels come from the API, so the
        // entry point keeps a plain (untranslated) label.
        { label: "Data", href: "/admin/m", icon: Database },
      ],
    },
  ];

  return (
    <div className="flex h-screen">
      <AppSidebar title={t("title")} sections={navSections}>
        {user && <UserMenu user={user} />}
      </AppSidebar>
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title={t("title")} sections={navSections} user={user} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <SetupAssistantBubble />
      <ImpersonationBanner />
    </div>
  );
}
