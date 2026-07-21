import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Bell,
  BookOpen,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Film,
  Globe,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageCircleQuestion,
  MessagesSquare,
  Newspaper,
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

import { CommandPalette } from "@/components/admin/command-palette";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

export function AdminShell({ children, user }: AdminShellProps) {
  const t = useTranslations("admin");
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      id: "products",
      label: t("nav.sections.products"),
      items: [
        {
          label: t("nav.items.courses"),
          href: "/admin/courses",
          icon: BookOpen,
        },
        { label: t("nav.items.liveEvents"), href: "/admin/live", icon: Video },
        {
          label: t("nav.items.downloads"),
          href: "/admin/downloads",
          icon: Download,
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
        { label: t("nav.items.inbox"), href: "/admin/inbox", icon: Inbox },
        {
          label: t("nav.items.notifications"),
          href: "/admin/notifications",
          icon: Bell,
        },
        { label: t("nav.items.email"), href: "/admin/email", icon: Mail },
        { label: t("nav.items.blog"), href: "/admin/blog", icon: Newspaper },
      ],
    },
    {
      id: "website",
      label: t("nav.sections.website"),
      items: [
        { label: t("nav.items.pages"), href: "/admin/pages", icon: FileText },
        { label: t("nav.items.design"), href: "/admin/design", icon: Palette },
        {
          label: t("nav.items.assistant"),
          href: "/admin/assistant",
          icon: MessageCircleQuestion,
        },
      ],
    },
    {
      id: "media",
      label: t("nav.sections.media"),
      items: [
        {
          label: t("nav.items.photos"),
          href: "/admin/photos",
          icon: ImageIcon,
        },
        { label: t("nav.items.videos"), href: "/admin/videos", icon: Film },
      ],
    },
    {
      id: "operations",
      label: t("nav.sections.operations"),
      items: [
        { label: t("nav.items.payouts"), href: "/admin/payouts", icon: Wallet },
        {
          label: t("nav.items.billing"),
          href: "/admin/billing",
          icon: CreditCard,
        },
        {
          label: t("nav.items.settings"),
          href: "/admin/settings",
          icon: Settings,
        },
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

        {/* Top Header Bar with Global Cmd+K Search & View Site */}
        <div className="border-b bg-card px-4 py-2.5 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 hover:bg-muted/80 rounded-lg border transition-colors w-full max-w-sm"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="truncate">Search commands or pages...</span>
            <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 font-mono text-[10px] bg-background border px-1.5 py-0.5 rounded shadow-sm text-foreground/80">
              ⌘K
            </kbd>
          </button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium shrink-0 shadow-sm"
          >
            <Link href="/" target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span>View Site</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
            </Link>
          </Button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <SetupAssistantBubble />
      <ImpersonationBanner />
    </div>
  );
}
