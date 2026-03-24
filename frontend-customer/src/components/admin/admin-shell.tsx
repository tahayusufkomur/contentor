"use client";

import {
  BookOpen,
  CreditCard,
  Download,
  Film,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  Palette,
  FileText,
  Settings,
  Users,
  Video,
} from "lucide-react";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { MobileHeader } from "@/components/shared/mobile-header";
import { UserMenu } from "@/components/shared/user-menu";
import type { NavSection } from "@/components/shared/app-sidebar";
import type { User } from "@/types/auth";

const navSections: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ label: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { label: "Courses", href: "/admin/courses", icon: BookOpen },
      { label: "Photos", href: "/admin/photos", icon: ImageIcon },
      { label: "Videos", href: "/admin/videos", icon: Film },
      { label: "Downloads", href: "/admin/downloads", icon: Download },
      { label: "Live Events", href: "/admin/live", icon: Video },
      { label: "Email", href: "/admin/email", icon: Mail },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [{ label: "Students", href: "/admin/students", icon: Users }],
  },
  {
    id: "site",
    label: "Site",
    items: [
      { label: "Pages", href: "/admin/pages", icon: FileText },
      { label: "Design", href: "/admin/design", icon: Palette },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    id: "business",
    label: "Business",
    items: [{ label: "Billing", href: "/admin/billing", icon: CreditCard }],
  },
];

interface AdminShellProps {
  children: React.ReactNode;
  user?: User | null;
}

export function AdminShell({ children, user }: AdminShellProps) {
  return (
    <div className="flex h-screen">
      <AppSidebar title="Admin" sections={navSections}>
        {user && <UserMenu user={user} />}
      </AppSidebar>
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title="Admin" sections={navSections} user={user} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
