import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Download,
  FileQuestion,
  Home,
  Info,
  Mail,
  Megaphone,
  Paintbrush,
  Phone,
  Rocket,
  Share2,
  Tag,
  Trash2,
  Video,
  Wallet,
} from "lucide-react";

export interface CatalogEntry {
  icon: LucideIcon;
  /** Deep link the row navigates to; null rows trigger `action` instead. */
  href: string | null;
  action?: "erase" | "copy-link";
}

export const SETUP_GROUP_ORDER = [
  "site",
  "content",
  "business",
  "live",
  "extras",
] as const;

export const SETUP_CATALOG: Record<string, CatalogEntry> = {
  page_home: { icon: Home, href: "/" },
  page_about: { icon: Info, href: "/about" },
  page_courses: { icon: BookOpen, href: "/courses" },
  // The builder's "pricing" page renders at /plans on the tenant site.
  page_pricing: { icon: Tag, href: "/plans" },
  page_faq: { icon: FileQuestion, href: "/faq" },
  page_contact: { icon: Phone, href: "/contact" },
  look: { icon: Paintbrush, href: "/admin/design" },
  first_course: { icon: BookOpen, href: "/admin/courses/new" },
  demo_cleanup: { icon: Trash2, href: null, action: "erase" },
  payouts: { icon: Wallet, href: "/admin/payouts" },
  publish: { icon: Rocket, href: "/admin#publish-card" },
  first_download: { icon: Download, href: "/admin/downloads" },
  first_live: { icon: Video, href: "/admin/live" },
  first_announcement: { icon: Megaphone, href: "/admin/notifications" },
  share_site: { icon: Share2, href: null, action: "copy-link" },
  studio_email: { icon: Mail, href: "/admin/inbox" },
};
