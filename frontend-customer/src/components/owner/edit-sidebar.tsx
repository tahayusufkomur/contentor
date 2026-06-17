"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BrandTab } from "./brand-tab";
import { NavbarTab } from "./navbar-tab";
import { BlocksTab } from "./blocks-tab";
import { EditorStoreProvider } from "./canvas/editor-store";
import { CanvasDndProvider } from "./canvas/canvas-dnd-provider";
import { UndoRedoControls } from "./canvas/editor-controls";
import { RichEditorProvider } from "./rich-editor";
import {
  PanelLeftOpen,
  PanelLeftClose,
  Palette,
  Navigation,
  ChevronDown,
  Loader2,
  Settings,
  LayoutList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TenantContext } from "@/hooks/use-tenant";
import { generateThemeCSS } from "@/lib/themes";
import {
  PAGE_KEYS,
  PAGE_LABELS,
  PAGE_ROUTES,
  pageKeyForPath,
} from "@/lib/blocks/pages";
import type { Block, PageTemplate, TenantConfig } from "@/types/tenant";

type Mode = "site" | "pages";
type SiteSection = "brand" | "navbar";

const SITE_SECTIONS: {
  id: SiteSection;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "brand", label: "Brand", icon: <Palette className="h-4 w-4" /> },
  { id: "navbar", label: "Navbar", icon: <Navigation className="h-4 w-4" /> },
];

const DEBOUNCE_MS = 800;
const SIDEBAR_WIDTH = 380;

interface EditSidebarProps {
  initialConfig: TenantConfig;
  children: React.ReactNode;
}

export function EditSidebar({ initialConfig, children }: EditSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const activePageKey = pageKeyForPath(pathname);
  const [open, setOpen] = useState(!initialConfig.onboarding_completed);
  const [mode, setMode] = useState<Mode>(
    initialConfig.onboarding_completed ? "pages" : "site",
  );
  const [expanded, setExpanded] = useState<Set<SiteSection>>(
    () => new Set<SiteSection>(["brand"]),
  );
  const [config, setConfig] = useState<TenantConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConfigRef = useRef<TenantConfig | null>(null);

  const toggleSection = (id: SiteSection) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const persistConfig = useCallback(
    async (nextConfig: TenantConfig) => {
      pendingConfigRef.current = null;
      setSaving(true);
      try {
        const { id, ...payload } = nextConfig;
        void id;
        const res = await fetch("/api/admin/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [router],
  );

  // Every change autosaves (debounced). Mark onboarding complete on first save.
  const handleChange = useCallback(
    (patch: Partial<TenantConfig>) => {
      const nextConfig: TenantConfig = { ...config, ...patch };
      if (!nextConfig.onboarding_completed)
        nextConfig.onboarding_completed = true;
      setConfig(nextConfig);
      pendingConfigRef.current = nextConfig;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => persistConfig(nextConfig),
        DEBOUNCE_MS,
      );
    },
    [config, persistConfig],
  );

  // Flush pending autosave before navigating between pages.
  const flushPending = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingConfigRef.current) persistConfig(pendingConfigRef.current);
  }, [persistConfig]);

  const goToPage = (route: string) => {
    if (route === pathname) return;
    flushPending();
    router.push(route);
  };

  // Coach-saved page templates ("my templates") live on the config alongside
  // pages; saving/deleting one rides the same debounced autosave.
  const handleSaveTemplate = (name: string, blocks: Block[]) => {
    const rand =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    const tmpl: PageTemplate = {
      id: `tmpl_${rand}`,
      name,
      category: "",
      blocks,
    };
    handleChange({ page_templates: [...(config.page_templates ?? []), tmpl] });
  };
  const handleDeleteTemplate = (id: string) => {
    handleChange({
      page_templates: (config.page_templates ?? []).filter((t) => t.id !== id),
    });
  };

  // Load the selected Google Font client-side so font changes reflect live
  // (the root layout only adds the <link> on a full server render).
  useEffect(() => {
    if (!config.font_family) return;
    const id = "tenant-editor-font";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(config.font_family)}&display=swap`;
  }, [config.font_family]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  return (
    <EditorStoreProvider
      initialPages={config.pages}
      onPagesChange={(pages) => handleChange({ pages })}
    >
      <RichEditorProvider>
        <CanvasDndProvider activePageKey={activePageKey}>
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
                <div className="flex items-center gap-1">
                  <UndoRedoControls />
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Close panel"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Mode tabs — Site settings vs Page content */}
              <div
                className="flex gap-1 border-b p-2"
                style={{ minWidth: SIDEBAR_WIDTH }}
              >
                <button
                  onClick={() => setMode("site")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    mode === "site"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Settings className="h-4 w-4" /> Site
                </button>
                <button
                  onClick={() => setMode("pages")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    mode === "pages"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <LayoutList className="h-4 w-4" /> Pages
                </button>
              </div>

              <div
                className="flex-1 overflow-y-auto"
                style={{ minWidth: SIDEBAR_WIDTH }}
              >
                {mode === "site" ? (
                  <>
                    <p className="px-5 pb-1 pt-4 text-xs text-muted-foreground">
                      Brand and navigation apply across every page.
                    </p>
                    {SITE_SECTIONS.map((section) => (
                      <div
                        key={section.id}
                        className="border-b last:border-b-0"
                      >
                        <button
                          onClick={() => toggleSection(section.id)}
                          className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors hover:bg-accent/50"
                        >
                          <span className="text-muted-foreground">
                            {section.icon}
                          </span>
                          <span className="flex-1 text-left">
                            {section.label}
                          </span>
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
                              {section.id === "brand" ? (
                                <BrandTab
                                  config={config}
                                  onChange={handleChange}
                                />
                              ) : (
                                <NavbarTab
                                  config={config}
                                  onChange={handleChange}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="px-5 py-4">
                    {/* Page switcher */}
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Editing page
                    </p>
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {PAGE_KEYS.map((key) => (
                        <button
                          key={key}
                          onClick={() => goToPage(PAGE_ROUTES[key])}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                            activePageKey === key
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                          )}
                        >
                          {PAGE_LABELS[key]}
                        </button>
                      ))}
                    </div>

                    {activePageKey ? (
                      <BlocksTab
                        key={activePageKey}
                        pageKey={activePageKey}
                        savedTemplates={config.page_templates ?? []}
                        onSaveTemplate={handleSaveTemplate}
                        onDeleteTemplate={handleDeleteTemplate}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This page isn&apos;t editable from the builder. Pick a
                        page above to edit its content.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </aside>

            {/* Sticky toggle tab — visible when sidebar is closed */}
            {!open && (
              <button
                onClick={() => setOpen(true)}
                className="fixed left-0 top-1/2 z-50 flex -translate-y-1/2 items-center gap-1.5 rounded-r-lg border border-l-0 bg-background px-2 py-3 text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground"
                title="Open editor"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            {/* Page content — shifts right when sidebar is open */}
            <div
              className="min-w-0 flex-1 transition-all duration-300 ease-in-out"
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
        </CanvasDndProvider>
      </RichEditorProvider>
    </EditorStoreProvider>
  );
}
