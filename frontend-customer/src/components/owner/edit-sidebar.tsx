"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandTab } from "./brand-tab";
import { NavbarTab } from "./navbar-tab";
import { SectionsTab } from "./sections-tab";
import {
  PanelLeftOpen,
  PanelLeftClose,
  Palette,
  Navigation,
  LayoutList,
  ChevronDown,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TenantContext } from "@/hooks/use-tenant";
import { generateThemeCSS } from "@/lib/themes";
import type { TenantConfig } from "@/types/tenant";

type Section = "brand" | "navbar" | "sections";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "brand", label: "Brand", icon: <Palette className="h-4 w-4" /> },
  { id: "navbar", label: "Navbar", icon: <Navigation className="h-4 w-4" /> },
  {
    id: "sections",
    label: "Landing sections",
    icon: <LayoutList className="h-4 w-4" />,
  },
];

const ONBOARDING_ORDER: Section[] = ["brand", "navbar", "sections"];
const DEBOUNCE_MS = 800;
const SIDEBAR_WIDTH = 380;

interface EditSidebarProps {
  initialConfig: TenantConfig;
  children: React.ReactNode;
}

export function EditSidebar({ initialConfig, children }: EditSidebarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(!initialConfig.onboarding_completed);
  const [expanded, setExpanded] = useState<Set<Section>>(() => new Set<Section>(["brand"]));
  const [config, setConfig] = useState<TenantConfig>(initialConfig);
  const [savedSections, setSavedSections] = useState<Set<Section>>(new Set());
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOnboarding = !config.onboarding_completed;

  const toggleSection = (id: Section) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const persistConfig = useCallback(
    async (nextConfig: TenantConfig) => {
      setSaving(true);
      try {
        const { id, ...payload } = nextConfig;
        const res = await fetch("/api/admin/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          router.refresh();
        }
      } finally {
        setSaving(false);
      }
    },
    [router],
  );

  const handleChange = useCallback(
    (patch: Partial<TenantConfig>, section: Section) => {
      const nextConfig = { ...config, ...patch };
      setConfig(nextConfig);
      setSavedSections((prev) => new Set(Array.from(prev).concat(section)));

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        persistConfig(nextConfig);
      }, DEBOUNCE_MS);
    },
    [config, persistConfig],
  );

  useEffect(() => {
    if (!isOnboarding) return;
    if (ONBOARDING_ORDER.every((t) => savedSections.has(t))) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const nextConfig = { ...config, onboarding_completed: true };
      persistConfig(nextConfig);
      setConfig(nextConfig);
    }
  }, [config, savedSections, isOnboarding, persistConfig]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const sectionContent: Record<Section, React.ReactNode> = {
    brand: (
      <BrandTab
        config={config}
        onChange={(patch) => handleChange(patch, "brand")}
      />
    ),
    navbar: (
      <NavbarTab
        config={config}
        onChange={(patch) => handleChange(patch, "navbar")}
      />
    ),
    sections: (
      <SectionsTab
        config={config}
        onChange={(patch) => handleChange(patch, "sections")}
      />
    ),
  };

  return (
    <div className="relative flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 z-50 flex h-full flex-col border-r bg-background transition-all duration-300 ease-in-out"
        style={{
          width: open ? SIDEBAR_WIDTH : 0,
          overflow: open ? undefined : "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ minWidth: SIDEBAR_WIDTH }}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Edit site</h2>
            {saving && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Close panel"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Onboarding progress bar */}
        {isOnboarding && (
          <div
            className="flex gap-0.5 px-5 py-3"
            style={{ minWidth: SIDEBAR_WIDTH }}
          >
            {ONBOARDING_ORDER.map((t) => (
              <div
                key={t}
                className={`h-1 flex-1 rounded-full transition-colors ${savedSections.has(t) ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>
        )}

        {/* Accordion sections */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ minWidth: SIDEBAR_WIDTH }}
        >
          {SECTIONS.map((section) => (
            <div key={section.id} className="border-b last:border-b-0">
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors hover:bg-accent/50"
              >
                <span className="text-muted-foreground">{section.icon}</span>
                <span className="flex-1 text-left">{section.label}</span>
                {savedSections.has(section.id) && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                )}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    expanded.has(section.id) && "rotate-180",
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-all duration-200 ease-in-out",
                  expanded.has(section.id)
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <div className="px-5 pb-5 pt-1">
                    {sectionContent[section.id]}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Onboarding completion */}
        {config.onboarding_completed && savedSections.size >= 3 && (
          <div
            className="border-t px-5 py-4 bg-primary/5"
            style={{ minWidth: SIDEBAR_WIDTH }}
          >
            <p className="text-xs text-center text-muted-foreground">
              Your site is set up! Changes save automatically.
            </p>
          </div>
        )}
      </aside>

      {/* Sticky toggle tab — visible when sidebar is closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed left-0 top-1/2 z-50 -translate-y-1/2 flex items-center gap-1.5 rounded-r-lg border border-l-0 bg-background px-2 py-3 text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground"
          title="Open editor"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* Page content — shifts right when sidebar is open */}
      <div
        className="flex-1 min-w-0 transition-all duration-300 ease-in-out"
        style={{ marginLeft: open ? SIDEBAR_WIDTH : 0 }}
      >
        {/* Live theme override — applies color/font changes instantly */}
        <style
          dangerouslySetInnerHTML={{
            __html: generateThemeCSS(
              config.theme,
              config.font_family,
              config.custom_css || "",
            ),
          }}
        />
        <TenantContext.Provider value={config}>
          {children}
        </TenantContext.Provider>
      </div>
    </div>
  );
}
