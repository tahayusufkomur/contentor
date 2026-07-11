"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Settings,
  Activity,
  ExternalLink,
  Mail,
  Inbox,
  MessagesSquare,
  Newspaper,
  Bot,
} from "lucide-react";

import { AppSidebar, type NavItem } from "@/components/shared/app-sidebar";
import { MobileHeader } from "@/components/shared/mobile-header";
import { createAdminClient } from "@/lib/admin-kit/client";
import { kitIcon } from "@/components/admin-kit/primitives";
import type { SiteMeta } from "@/lib/admin-kit/types";

interface AdminShellProps {
  children: React.ReactNode;
  user?: { name?: string; email?: string } | null;
}

// Static nav. The "Data" group is injected dynamically from the platform-admin
// site meta so every registered model gets its own sidebar entry.
const OVERVIEW: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
    group: "Overview",
  },
];
const AI: NavItem[] = [
  { label: "AI", href: "/admin/ai", icon: Bot, group: "AI" },
];
const CONTENT: NavItem[] = [
  { label: "Blog", href: "/admin/blog", icon: Newspaper, group: "Content" },
  {
    label: "Community",
    href: "/admin/community",
    icon: MessagesSquare,
    group: "Content",
  },
];
const COMMUNICATION: NavItem[] = [
  {
    label: "Inbox",
    href: "/admin/inbox",
    icon: Inbox,
    group: "Communication",
  },
  { label: "Email", href: "/admin/email", icon: Mail, group: "Communication" },
];
const SYSTEM: NavItem[] = [
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    group: "System",
  },
  { label: "Health", href: "/admin/health", icon: Activity, group: "System" },
  {
    label: "Go to site",
    href: "/",
    icon: ExternalLink,
    group: "System",
    external: true,
  },
];

export function AdminShell({ children, user }: AdminShellProps) {
  const client = useMemo(() => createAdminClient("/api/v1/platform-admin"), []);
  const [site, setSite] = useState<SiteMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .siteMeta()
      .then((meta) => {
        if (!cancelled) setSite(meta);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client]);

  const navItems = useMemo<NavItem[]>(() => {
    const dataItems: NavItem[] = (site?.models ?? []).map((model) => ({
      label: model.label_plural,
      href: `/admin/m/${model.key}`,
      icon: kitIcon(model.icon),
      group: "Data",
    }));
    return [...OVERVIEW, ...AI, ...CONTENT, ...COMMUNICATION, ...dataItems, ...SYSTEM];
  }, [site]);

  return (
    <div className="flex h-screen">
      <AppSidebar title="Contentor" navItems={navItems} user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title="Contentor" navItems={navItems} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
