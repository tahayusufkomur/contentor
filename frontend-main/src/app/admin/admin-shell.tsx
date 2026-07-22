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
  ScrollText,
  Bot,
} from "lucide-react";

import {
  AppSidebar,
  type NavItem,
  type NavSection,
} from "@/components/shared/app-sidebar";
import { MobileHeader } from "@/components/shared/mobile-header";
import { createAdminClient } from "@shared/admin-kit/client";
import { kitIcon } from "@shared/admin-kit/primitives";
import type { SiteMeta } from "@shared/admin-kit/types";

interface AdminShellProps {
  children: React.ReactNode;
  user?: { name?: string; email?: string } | null;
}

type IconType = React.ComponentType<{ className?: string }>;

/**
 * A bespoke (non-model) page placed directly in the nav.
 */
interface StaticRef {
  kind: "static";
  label: string;
  href: string;
  icon: IconType;
  external?: boolean;
}

/**
 * A registered platform-admin model, resolved from the site meta for its icon
 * and default label. `label` overrides the derived label — used to give an
 * awkward auto-label a clean name ("Ai Transcripts" → "AI Transcripts").
 */
interface ModelRef {
  kind: "model";
  key: string;
  label?: string;
}

type NavRef = StaticRef | ModelRef;

interface SectionConfig {
  id: string;
  label: string;
  items: NavRef[];
}

// Declarative sidebar layout. Static pages and registered models are
// interleaved here in display order; the 19 platform-admin models are grouped
// into meaningful sections instead of one flat "Data" dump. New models that
// aren't listed here surface automatically under a trailing "More" group (see
// below), so nothing silently disappears.
const SECTIONS: SectionConfig[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { kind: "static", label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      // The raw list is the entry point; each row's "Details" action
      // deep-links to the richer /admin/tenants/{slug} drill-down.
      { kind: "model", key: "tenants" },
      { kind: "model", key: "users" },
      { kind: "model", key: "wizard-funnel" },
    ],
  },
  {
    id: "revenue",
    label: "Revenue",
    items: [
      { kind: "model", key: "platform-plans" },
      { kind: "model", key: "platform-subscriptions" },
      { kind: "model", key: "domain-subscriptions" },
      { kind: "model", key: "webhook-events" },
    ],
  },
  {
    id: "ai",
    label: "AI",
    items: [
      { kind: "static", label: "AI Overview", href: "/admin/ai", icon: Bot },
      { kind: "model", key: "ai-transcripts", label: "AI Transcripts" },
      { kind: "model", key: "ai-ip-blocks", label: "AI IP Blocks" },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { kind: "static", label: "Blog", href: "/admin/blog", icon: Newspaper },
      { kind: "model", key: "platform-kb", label: "Knowledge Base" },
      { kind: "model", key: "curated-logos" },
      { kind: "model", key: "curated-photos" },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    items: [
      { kind: "static", label: "Inbox", href: "/admin/inbox", icon: Inbox },
      { kind: "static", label: "Email", href: "/admin/email", icon: Mail },
      {
        kind: "static",
        label: "Community",
        href: "/admin/community",
        icon: MessagesSquare,
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { kind: "model", key: "custom-domains" },
      { kind: "static", label: "Settings", href: "/admin/settings", icon: Settings },
      { kind: "static", label: "Logs", href: "/admin/logs", icon: ScrollText },
      { kind: "static", label: "Health", href: "/admin/health", icon: Activity },
      {
        kind: "static",
        label: "Go to site",
        href: "/",
        icon: ExternalLink,
        external: true,
      },
    ],
  },
];

// Models intentionally kept out of the sidebar. The five per-feature AI usage
// meters are already rolled up on /admin/ai, and the raw platform blog-post
// model is superseded by the bespoke /admin/blog page. All remain reachable
// via the /admin/m index.
const HIDDEN_MODELS = new Set<string>([
  "help-bot-usage",
  "student-bot-usage",
  "blog-ai-usage",
  "logo-ai-usage",
  "onboarding-ai-usage",
  "platform-blog-posts",
]);

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

  const navSections = useMemo<NavSection[]>(() => {
    const models = site?.models ?? [];
    const modelByKey = new Map(models.map((model) => [model.key, model]));
    const placed = new Set<string>();

    const sections: NavSection[] = SECTIONS.map((section) => {
      const items: NavItem[] = [];
      for (const ref of section.items) {
        if (ref.kind === "static") {
          items.push({
            label: ref.label,
            href: ref.href,
            icon: ref.icon,
            external: ref.external,
          });
          continue;
        }
        const model = modelByKey.get(ref.key);
        if (!model) continue; // not registered/visible for this user — skip
        placed.add(ref.key);
        items.push({
          label: ref.label ?? model.label_plural,
          href: `/admin/m/${model.key}`,
          icon: kitIcon(model.icon),
        });
      }
      return { id: section.id, label: section.label, items };
    });

    // Safety net: any registered model we didn't explicitly place (e.g. a
    // newly added admin panel) lands in a trailing "More" group so it never
    // silently vanishes from the nav.
    const extra = models.filter(
      (model) => !placed.has(model.key) && !HIDDEN_MODELS.has(model.key),
    );
    if (extra.length > 0) {
      sections.push({
        id: "more",
        label: "More",
        items: extra.map((model) => ({
          label: model.label_plural,
          href: `/admin/m/${model.key}`,
          icon: kitIcon(model.icon),
        })),
      });
    }

    // Drop groups that resolved to nothing (e.g. before the meta loads, or if
    // every model in a group is unregistered).
    return sections.filter((section) => section.items.length > 0);
  }, [site]);

  return (
    <div className="flex h-screen">
      <AppSidebar title="Contentor" sections={navSections} user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title="Contentor" sections={navSections} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
