"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { useTranslations } from "next-intl";
import { BrandTab } from "./brand-tab";
import { NavbarTab } from "./navbar-tab";
import { BlocksTab } from "./blocks-tab";
import { EditorStoreProvider, useEditorStore } from "./canvas/editor-store";
import { CanvasDndProvider } from "./canvas/canvas-dnd-provider";
import { UndoRedoControls } from "./canvas/editor-controls";
import { RichEditorProvider } from "./rich-editor";
import { EditModeProvider } from "./edit-mode";
import {
  PanelLeftClose,
  Palette,
  Navigation,
  ChevronDown,
  ChevronRight,
  Settings,
  LayoutList,
  Pencil,
  Eye,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { announceSiteUpdated, SITE_UPDATED_EVENT } from "@/lib/site-events";
import { clientFetch } from "@/lib/api-client";
import { siteLook, styleFontsHref } from "@/lib/site-styles";
import { Spinner } from "@/components/ui/spinner";
import { EntitlementsProvider } from "@/components/admin/entitlements-provider";
import { TenantContext } from "@/hooks/use-tenant";
import { TenantThemeStyle } from "@/components/shared/tenant-theme-style";
import { SetupAssistantBubble } from "@/components/setup/setup-assistant-bubble";
import {
  PAGE_KEYS,
  PAGE_LABELS,
  PAGE_ROUTES,
  pageKeyForPath,
} from "@/lib/blocks/pages";
import { SetupAssistantPanel } from "@/components/setup/setup-assistant-panel";
import { refreshSetupStatus, useSetupStatus } from "@/lib/setup-assistant";
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
const EDIT_MODE_KEY = "contentor:edit-mode";

interface EditSidebarProps {
  initialConfig: TenantConfig;
  children: React.ReactNode;
}

export function EditSidebar({ initialConfig, children }: EditSidebarProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = usePathname();
  const activePageKey = pageKeyForPath(pathname);
  // Edit mode is off by default (the owner sees their site like a visitor),
  // except for a coach who hasn't finished onboarding — they land straight in
  // the editor. A returning coach's last choice is restored from localStorage
  // after mount (kept out of the initial state to avoid an SSR hydration gap).
  const [editMode, setEditMode] = useState(!initialConfig.onboarding_completed);
  const [open, setOpen] = useState(!initialConfig.onboarding_completed);
  const [mode, setMode] = useState<Mode>(
    initialConfig.onboarding_completed ? "pages" : "site",
  );
  const [expanded, setExpanded] = useState<Set<SiteSection>>(
    () => new Set<SiteSection>(["brand"]),
  );
  const [config, setConfig] = useState<TenantConfig>(initialConfig);
  const [studioOpen, setStudioOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConfigRef = useRef<TenantConfig | null>(null);
  // Server-side config changes made outside this editor (copilot apply):
  // re-pull config and push the fresh pages into the editor store, so the
  // canvas repaints in place — no reload, editor + chat state survive.
  const [serverSync, setServerSync] = useState<{
    pages: NonNullable<TenantConfig["pages"]>;
    seq: number;
  }>();
  useEffect(() => {
    const onSiteUpdated = async () => {
      try {
        const res = await fetch("/api/admin/config");
        if (!res.ok) return;
        const fresh: TenantConfig = await res.json();
        setConfig(fresh);
        setServerSync((prev) => ({
          pages: fresh.pages ?? {},
          seq: (prev?.seq ?? 0) + 1,
        }));
      } catch {
        // Stale canvas until the next reload — same as before this listener.
      }
    };
    window.addEventListener(SITE_UPDATED_EVENT, onSiteUpdated);
    return () => window.removeEventListener(SITE_UPDATED_EVENT, onSiteUpdated);
  }, []);

  const toggleSection = (id: SiteSection) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Debounced multi-trigger autosave (fired from the debounce timer below AND
  // from flushPending() on navigation) — deliberately NOT useAsyncAction: its
  // single-flight guard would silently drop a flush-on-navigate call that
  // arrives while an earlier debounced call for older edits is still in
  // flight, losing the coach's latest changes.
  const persistConfig = useCallback(
    async (nextConfig: TenantConfig) => {
      pendingConfigRef.current = null;
      setSaving(true);
      try {
        const { id, ...payload } = nextConfig;
        void id;
        // The backend discards mark.url for image marks on write and
        // re-derives it from photo_id on read (validate_logo_recipe) —
        // re-sending the session's base64 data URL just bloats every autosave
        // PATCH by the whole image. Same wire rule LogoStudio.handleSave
        // applies. v1 and v2 recipes both keep mark.url at the same path.
        const recipe = payload.logo_recipe as
          | { mark?: { type?: string; url?: string } }
          | undefined;
        if (recipe && recipe.mark?.type === "image") {
          payload.logo_recipe = {
            ...recipe,
            mark: { ...recipe.mark, url: "" },
          } as typeof payload.logo_recipe;
        }
        const res = await fetch("/api/admin/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          router.refresh();
          void refreshSetupStatus();
        } else toast.error("Could not save your changes. Please try again.");
      } catch {
        toast.error("Could not save your changes. Please try again.");
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

  // Another look restyles every page on the server (config/look/): pending
  // edits save first, then the editor re-pulls config and pages.
  const applyLook = async (look: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingConfigRef.current) await persistConfig(pendingConfigRef.current);
    await clientFetch("/api/v1/admin/config/look/", {
      method: "POST",
      body: JSON.stringify({ look }),
    });
    announceSiteUpdated();
    router.refresh();
    void refreshSetupStatus();
  };

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
    navigate(route);
  };

  // Restore the coach's last edit-mode choice after mount (skipped for a coach
  // still onboarding, who always starts in the editor).
  useEffect(() => {
    if (!initialConfig.onboarding_completed) return;
    const saved = localStorage.getItem(EDIT_MODE_KEY);
    if (saved !== null) setEditMode(saved === "1");
  }, [initialConfig.onboarding_completed]);

  // Deep links into the editor. It is the only home for design settings now
  // (the standalone /admin/design page is gone), so every old entry point —
  // admin nav, command palette, publish card, setup assistant — lands here:
  //   /?edit=1                → straight into the editor, panel open
  //   /?edit=1&section=brand  → …with that Site section expanded
  //   /?edit=1&studio=1       → …with the Logo Studio open
  // `section`/`studio` imply edit mode, so a link that omits `edit=1` still
  // works. Declared after the localStorage restore above so it wins on mount.
  // (window.location, NOT useSearchParams — avoids the Next 14 client-side
  // Suspense bailout.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const studio = params.get("studio") === "1";
    const section = params.get("section");
    if (params.get("edit") !== "1" && !studio && !section) return;

    setEditMode(true);
    setOpen(true);
    try {
      localStorage.setItem(EDIT_MODE_KEY, "1");
    } catch {}

    if (studio || section === "brand" || section === "navbar") {
      setMode("site");
      setExpanded(
        new Set<SiteSection>([section === "navbar" ? "navbar" : "brand"]),
      );
    }
    if (studio) setStudioOpen(true);
  }, []);

  const toggleEditMode = (on: boolean) => {
    if (!on) flushPending();
    setEditMode(on);
    if (on) setOpen(true);
    try {
      localStorage.setItem(EDIT_MODE_KEY, on ? "1" : "0");
    } catch {}
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

  // Load the look's fonts client-side so a look change reflects live (the
  // root layout only adds the <link> on a full server render).
  const fontsHref = styleFontsHref(siteLook(config.style));
  useEffect(() => {
    const id = "tenant-editor-font";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = fontsHref;
  }, [fontsHref]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  return (
    <EditModeProvider value={editMode}>
      <EditorStoreProvider
        initialPages={config.pages}
        onPagesChange={(pages) => handleChange({ pages })}
        serverPages={serverSync}
        niche={config.niche}
        siteStyle={config.style ?? ""}
      >
        <RichEditorProvider>
          <CanvasDndProvider activePageKey={activePageKey}>
            {/* Selecting a block on the canvas jumps the sidebar to Pages mode
                and opens it, so the clicked block's editor is right there. */}
            <SelectionSync
              onBlockSelected={() => {
                setMode("pages");
                setOpen(true);
              }}
            />
            <div className="relative flex min-h-screen">
              {/* Sidebar — only mounted while editing. EntitlementsProvider is
                  normally mounted by AdminShell, which doesn't wrap the public
                  site; the panel needs it for the Logo Studio's paid badge. */}
              {editMode && (
                <EntitlementsProvider>
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
                        {saving && <Spinner size="sm" label="Saving" />}
                      </div>
                      <div className="flex items-center gap-1">
                        <UndoRedoControls />
                        <button
                          onClick={() => toggleEditMode(false)}
                          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Exit edit mode — preview your site"
                        >
                          <Eye className="h-4 w-4" /> Done
                        </button>
                        <button
                          onClick={() => setOpen(false)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Collapse panel"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Always-on setup progress: same panel as /admin */}
                    <SetupSidebarRow minWidth={SIDEBAR_WIDTH} />

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
                            ? "bg-primary/10 text-foreground"
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
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <LayoutList className="h-4 w-4" /> Pages
                      </button>
                    </div>

                    {/* `overscroll-contain`: reaching either end of the panel
                      must NOT chain the wheel through to the page behind it —
                      the surface under the pointer is the one that scrolls. */}
                    <div
                      className="flex-1 overflow-y-auto overscroll-contain"
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
                                className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors hover:bg-muted/50"
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
                                        studioOpen={studioOpen}
                                        onStudioOpenChange={setStudioOpen}
                                        onApplyLook={applyLook}
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
                                    ? "border-primary bg-primary/10 text-foreground"
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
                              This page isn&apos;t editable from the builder.
                              Pick a page above to edit its content.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </aside>
                </EntitlementsProvider>
              )}

              {/* The entry to the edit menu, on the left edge: it enters edit
                  mode if the site is not being edited, then opens the panel.
                  Hidden while the panel is open. */}
              {!(editMode && open) && (
                <button
                  onClick={() =>
                    editMode ? setOpen(true) : toggleEditMode(true)
                  }
                  className="fixed left-0 top-1/2 z-50 flex -translate-y-1/2 items-center gap-1.5 rounded-r-lg border border-l-0 bg-background py-2 pl-2 pr-1.5 text-xs font-medium text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground"
                  title="Edit your site"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit site
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Page content — shifts right when the editor panel is open */}
              <div
                className="min-w-0 flex-1 transition-all duration-300 ease-in-out"
                style={{ marginLeft: editMode && open ? SIDEBAR_WIDTH : 0 }}
              >
                {/* Live theme override — applies color/font changes instantly.
                    Same component as the page head, so a styled site keeps its
                    look's palette instead of the legacy `theme` (ocean). */}
                <TenantThemeStyle config={config} />
                <TenantContext.Provider value={config}>
                  {children}
                </TenantContext.Provider>
                {!config.is_published && <SetupAssistantBubble />}
              </div>
            </div>
          </CanvasDndProvider>
        </RichEditorProvider>
      </EditorStoreProvider>
    </EditModeProvider>
  );
}

// Bridges canvas selection (owned by the editor store) up to the sidebar's
// mode/open state (owned by EditSidebar, above the store). Renders nothing;
// fires `onBlockSelected` whenever a block becomes selected so a click on the
// live canvas surfaces that block's editor even if the coach was on the Site
// tab or had the panel collapsed.
function SelectionSync({ onBlockSelected }: { onBlockSelected: () => void }) {
  const { selectedBlockId } = useEditorStore();
  const cb = useRef(onBlockSelected);
  cb.current = onBlockSelected;
  useEffect(() => {
    if (selectedBlockId) cb.current();
  }, [selectedBlockId]);
  return null;
}

// The edit sidebar renders on the tenant public site, but the root layout's
// NextIntlClientProvider is fed every namespace (see src/i18n/request.ts), so
// the "admin" namespace used by /admin's setup UI is available here too —
// reuse `setup.progressLabel` instead of hardcoding a duplicate string.
function SetupSidebarRow({ minWidth }: { minWidth: number }) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const status = useSetupStatus();
  if (!status || status.dismissed) return null;
  const { done, total } = status.progress;
  if (total > 0 && done === total) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between border-b bg-primary/5 px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-primary/10"
        style={{ minWidth }}
      >
        <span>{t("setup.progressLabel", { done, total })}</span>
        <ArrowRight className="h-4 w-4" />
      </button>
      <SetupAssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
