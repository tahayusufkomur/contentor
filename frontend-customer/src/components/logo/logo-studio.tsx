"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Upload, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { clientFetch } from "@/lib/api-client";
import {
  COLOR_PAIRS, ICON_GROUPS, LOGO_FONTS, LOGO_ICONS, TEXT_COLORS, defaultRecipe, initialsFor,
} from "@/lib/logo/catalog";
import { imageToDataUrl, svgToPngBlob, uploadPng } from "@/lib/logo/export";
import { getThemePalette } from "@/lib/themes";
import type { LogoRecipe, RecipeBadge, RecipeLayout } from "@/types/logo";
import type { TenantConfig } from "@/types/tenant";
import { LOGO_VIEWBOX, LogoRenderer, MarkRenderer } from "./logo-renderer";

const LAYOUTS: { id: RecipeLayout; label: string }[] = [
  { id: "badge_name", label: "Badge + name" },
  { id: "icon_name", label: "Icon + name" },
  { id: "name_only", label: "Name only" },
];
const BADGES: { id: RecipeBadge; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded" },
  { id: "squircle", label: "Squircle" },
  { id: "none", label: "None" },
];

interface LogoStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TenantConfig;
  onSaved: (patch: Partial<TenantConfig>) => void;
}

function isCompleteRecipe(value: unknown): value is LogoRecipe {
  return !!value && typeof value === "object" && (value as LogoRecipe).version === 1;
}

export function LogoStudio({ open, onOpenChange, config, onSaved }: LogoStudioProps) {
  const theme = getThemePalette(config.theme);
  const [recipe, setRecipe] = useState<LogoRecipe>(() =>
    isCompleteRecipe(config.logo_recipe)
      ? (config.logo_recipe as LogoRecipe)
      : defaultRecipe(config.brand_name, theme.primaryHex),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoSvgRef = useRef<SVGSVGElement>(null);
  const markSvgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load all studio fonts once so previews render true.
  useEffect(() => {
    if (!open) return;
    const id = "logo-studio-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${LOGO_FONTS.map(
      (f) => `family=${encodeURIComponent(f)}:wght@700`,
    ).join("&")}&display=swap`;
    document.head.appendChild(link);
  }, [open]);

  const patch = (part: Partial<LogoRecipe>) => setRecipe((r) => ({ ...r, ...part }));

  async function handleMarkUpload(file: File) {
    setError(null);
    try {
      const dataUrl = await imageToDataUrl(URL.createObjectURL(file));
      // Persist the original file so the mark survives re-edit sessions; the
      // in-memory data URL is what the preview/export uses this session.
      const uploaded = await uploadPng(file, file.name, file.type);
      patch({ mark: { type: "image", photo_id: uploaded.photo_id, url: dataUrl } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleSave() {
    if (!logoSvgRef.current || !markSvgRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const logoBlob = await svgToPngBlob(logoSvgRef.current, LOGO_VIEWBOX.w * 2, LOGO_VIEWBOX.h * 2, recipe.font);
      const markBlob = await svgToPngBlob(markSvgRef.current, 1024, 1024, recipe.font);
      const logo = await uploadPng(logoBlob, "logo.png");
      const mark = await uploadPng(markBlob, "logo-icon.png");
      const body = {
        logo_id: logo.photo_id,
        logo_url: logo.signed_url,
        icon_id: mark.photo_id,
        icon_url: mark.signed_url,
        logo_recipe: recipe,
      };
      await clientFetch("/api/v1/admin/config/", { method: "PATCH", body: JSON.stringify(body) });
      onSaved(body);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the logo — you can upload a file instead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
            onClick={() => onOpenChange(false)}
          >
            <div
              className="flex h-[92vh] max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-lg font-semibold">Logo Studio</h2>
                <div className="flex items-center gap-2">
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Use this logo
                  </Button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1">
                {/* ── Preview column ─────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-1 flex-col items-center gap-6 overflow-y-auto bg-muted/40 p-8">
                  {/* Site header context, light + dark */}
                  <div className="w-full max-w-xl space-y-3">
                    <div className="rounded-lg border bg-white px-4 py-3 shadow-sm">
                      <LogoRenderer recipe={recipe} width={240} svgRef={logoSvgRef} />
                    </div>
                    <div className="rounded-lg border bg-zinc-900 px-4 py-3 shadow-sm">
                      <LogoRenderer recipe={recipe} width={240} />
                    </div>
                  </div>
                  {/* Favicon + home-screen context */}
                  <div className="flex items-end gap-8">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 rounded-t-lg border bg-white px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                        <MarkRenderer recipe={recipe} size={16} />
                        {recipe.name}
                      </div>
                      <span className="text-xs text-muted-foreground">Browser tab</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="overflow-hidden rounded-2xl shadow-md">
                        <MarkRenderer recipe={recipe} size={64} svgRef={markSvgRef} />
                      </div>
                      <span className="text-xs text-muted-foreground">App icon</span>
                    </div>
                  </div>
                </div>

                {/* ── Controls rail ──────────────────────────────────────────── */}
                <div className="w-80 shrink-0 space-y-6 overflow-y-auto border-l p-5">
                  <section className="space-y-1.5">
                    <p className="text-sm font-medium">Name</p>
                    <input
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={recipe.name}
                      maxLength={80}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </section>

                  <section className="space-y-1.5">
                    <p className="text-sm font-medium">Layout</p>
                    <div className="flex flex-wrap gap-1.5">
                      {LAYOUTS.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => patch({ layout: l.id })}
                          className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.layout === l.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  {recipe.layout !== "name_only" && (
                    <section className="space-y-1.5">
                      <p className="text-sm font-medium">Mark</p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => patch({ mark: { type: "initials" } })}
                          className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.mark.type === "initials" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                        >
                          {initialsFor(recipe.name)} Initials
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleMarkUpload(e.target.files[0])}
                        />
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                          <Upload className="h-3.5 w-3.5" /> Your own
                        </Button>
                      </div>
                      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                        {ICON_GROUPS.map((group) => (
                          <div key={group.label}>
                            <p className="mb-1 text-xs text-muted-foreground">{group.label}</p>
                            <div className="grid grid-cols-8 gap-1">
                              {group.icons.map((iconName) => {
                                const Icon = LOGO_ICONS[iconName];
                                const active = recipe.mark.type === "icon" && recipe.mark.icon === iconName;
                                return (
                                  <button
                                    key={iconName}
                                    type="button"
                                    aria-label={iconName}
                                    onClick={() => patch({ mark: { type: "icon", icon: iconName } })}
                                    className={`flex h-8 items-center justify-center rounded-md border ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {recipe.layout !== "name_only" && (
                    <section className="space-y-1.5">
                      <p className="text-sm font-medium">Badge shape</p>
                      <div className="flex flex-wrap gap-1.5">
                        {BADGES.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => patch({ badge: b.id })}
                            className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.badge === b.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="space-y-1.5">
                    <p className="text-sm font-medium">Font</p>
                    <div className="flex flex-wrap gap-1.5">
                      {LOGO_FONTS.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => patch({ font: f })}
                          style={{ fontFamily: `'${f}', sans-serif` }}
                          className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.font === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-1.5">
                    <p className="text-sm font-medium">Colors</p>
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_PAIRS(theme.primaryHex).map((pair) => {
                        const active = recipe.colors.badge_bg === pair.badge_bg && recipe.colors.mark_fg === pair.mark_fg;
                        return (
                          <button
                            key={pair.label}
                            type="button"
                            title={pair.label}
                            onClick={() => patch({ colors: { ...recipe.colors, badge_bg: pair.badge_bg, mark_fg: pair.mark_fg } })}
                            className={`h-7 w-7 rounded-full border-2 ${active ? "border-primary" : "border-transparent"}`}
                            style={{ background: pair.badge_bg }}
                          />
                        );
                      })}
                      <input
                        type="color"
                        aria-label="Custom badge color"
                        value={recipe.colors.badge_bg}
                        onChange={(e) => patch({ colors: { ...recipe.colors, badge_bg: e.target.value } })}
                        className="h-7 w-7 cursor-pointer rounded-full border p-0"
                      />
                    </div>
                    <p className="pt-1 text-xs text-muted-foreground">Name color</p>
                    <div className="flex gap-1.5">
                      {TEXT_COLORS(theme.primaryHex).map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`Name color ${hex}`}
                          onClick={() => patch({ colors: { ...recipe.colors, text: hex } })}
                          className={`h-7 w-7 rounded-full border-2 ${recipe.colors.text === hex ? "border-primary" : "border-border"}`}
                          style={{ background: hex }}
                        />
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
