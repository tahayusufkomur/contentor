"use client";

import {
  BookOpen,
  CreditCard,
  Download,
  LayoutDashboard,
  Palette,
  FileText,
  Users,
  Video,
} from "lucide-react";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { MobileHeader } from "@/components/shared/mobile-header";
import type { NavSection } from "@/components/shared/app-sidebar";

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
      { label: "Downloads", href: "/admin/downloads", icon: Download },
      { label: "Live Classes", href: "/admin/live", icon: Video },
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
    ],
  },
  {
    id: "business",
    label: "Business",
    items: [{ label: "Billing", href: "/admin/billing", icon: CreditCard }],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <AppSidebar title="Admin" sections={navSections} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title="Admin" sections={navSections} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
