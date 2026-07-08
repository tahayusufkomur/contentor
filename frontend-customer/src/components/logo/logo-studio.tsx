"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { clientFetch } from "@/lib/api-client";
import {
  ICON_GROUPS,
  LOGO_FONTS,
  LOGO_ICONS,
  PALETTES,
  TEXT_COLORS,
  applyPalette,
  defaultRecipe,
  initialsFor,
} from "@/lib/logo/catalog";
import { ABSTRACT_FAMILIES } from "@/lib/logo/abstract";
import { imageToDataUrl, svgToPngBlob, uploadPng, type FontSpec } from "@/lib/logo/export";
import { isRecipe, migrateRecipe } from "@/lib/logo/migrate";
import { getThemePalette } from "@/lib/themes";
import type {
  AnyLogoRecipe,
  BadgeShape,
  LogoRecipe,
  RecipeLayout,
} from "@/types/logo";
import type { TenantConfig } from "@/types/tenant";
import { AbstractMark } from "./abstract-mark";
import { logoViewBox, LogoRenderer, MarkRenderer } from "./logo-renderer";

const LAYOUTS: { id: RecipeLayout; label: string }[] = [
  { id: "horizontal", label: "Mark + name" },
  { id: "horizontal_reversed", label: "Name + mark" },
  { id: "stacked", label: "Stacked" },
  { id: "emblem", label: "Emblem" },
  { id: "name_only", label: "Name only" },
];
const BADGES: { id: BadgeShape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded" },
  { id: "squircle", label: "Squircle" },
  { id: "hexagon", label: "Hexagon" },
  { id: "shield", label: "Shield" },
  { id: "diamond", label: "Diamond" },
  { id: "none", label: "None" },
];

interface LogoStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TenantConfig;
  onSaved: (patch: Partial<TenantConfig>) => void;
}

function seedRecipe(config: TenantConfig, primaryHex: string): LogoRecipe {
  return isRecipe(config.logo_recipe)
    ? migrateRecipe(config.logo_recipe as AnyLogoRecipe)
    : defaultRecipe(config.brand_name, primaryHex);
}

export function LogoStudio({ open, onOpenChange, config, onSaved }: LogoStudioProps) {
  const theme = getThemePalette(config.theme);
  const [recipe, setRecipe] = useState<LogoRecipe>(() => seedRecipe(config, theme.primaryHex));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoSvgRef = useRef<SVGSVGElement>(null);
  const markSvgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const dragRef = useRef<{
    part: "mark" | "name" | "tagline";
    startX: number;
    startY: number;
    base: [number, number];
  } | null>(null);
  const [suggestions, setSuggestions] = useState<LogoRecipe[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Load all studio fonts once so previews render true (each family's real
  // shipped weights).
  useEffect(() => {
    if (!open) return;
    const id = "logo-studio-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${LOGO_FONTS.map(
      (f) => `family=${encodeURIComponent(f.family)}:wght@${f.weights.join(";")}`,
    ).join("&")}&display=swap`;
    document.head.appendChild(link);
  }, [open]);

  // Re-seed the recipe from the latest config every time the studio opens, so
  // a stale in-memory recipe (from a prior session, or a config change since
  // mount) doesn't linger — this component stays mounted across opens.
  useEffect(() => {
    if (open) setRecipe(seedRecipe(config, theme.primaryHex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (part: Partial<LogoRecipe>) => setRecipe((r) => ({ ...r, ...part }));

  function beginDrag(e: React.PointerEvent<SVGSVGElement>) {
    if (!adjusting) return;
    const part = (e.target as Element)
      .closest("[data-part]")
      ?.getAttribute("data-part") as "mark" | "name" | "tagline" | null;
    if (!part) return;
    const base = recipe.elements[part].offset;
    dragRef.current = { part, startX: e.clientX, startY: e.clientY, base: [...base] as [number, number] };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = e.currentTarget;
    // convert screen px to viewBox units
    const scale = logoViewBox(recipe.layout).w / svg.getBoundingClientRect().width;
    const clampOff = (v: number) => Math.max(-120, Math.min(120, v));
    const snap = (v: number) => (Math.abs(v) < 6 ? 0 : v);
    const dx = snap(clampOff(drag.base[0] + (e.clientX - drag.startX) * scale));
    const dy = snap(clampOff(drag.base[1] + (e.clientY - drag.startY) * scale));
    setRecipe((r) => ({
      ...r,
      elements: {
        ...r.elements,
        [drag.part]: { ...r.elements[drag.part], offset: [dx, dy] },
      },
    }));
  }

  function endDrag() {
    dragRef.current = null;
  }

  async function fetchSuggestions() {
    setSuggesting(true);
    setError(null);
    try {
      const data = await clientFetch<{ suggestions: AnyLogoRecipe[] }>(
        "/api/v1/admin/config/logo-suggestions/",
        { method: "POST", body: JSON.stringify({}) },
      );
      // The endpoint still returns v1 recipes (Phase 4 upgrades it); migrate
      // each on receipt so cards render through the v2 renderer.
      setSuggestions(data.suggestions.map((s) => migrateRecipe(s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch ideas");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleMarkUpload(file: File) {
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    try {
      const dataUrl = await imageToDataUrl(objectUrl);
      // Persist the original file so the mark survives re-edit sessions; the
      // in-memory data URL is what the preview/export uses this session.
      const uploaded = await uploadPng(file, file.name, file.type);
      patch({ mark: { type: "image", photo_id: uploaded.photo_id, url: dataUrl } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleSave() {
    if (!logoSvgRef.current || !markSvgRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const vb = logoViewBox(recipe.layout);
      const fonts: FontSpec[] = [
        { family: recipe.typography.name.font, weight: recipe.typography.name.weight },
        ...(recipe.tagline.trim()
          ? [{ family: recipe.typography.tagline.font, weight: recipe.typography.tagline.weight }]
          : []),
      ];
      const logoBlob = await svgToPngBlob(logoSvgRef.current, vb.w * 2, vb.h * 2, fonts);
      const markBlob = await svgToPngBlob(markSvgRef.current, 1024, 1024, fonts);
      const logo = await uploadPng(logoBlob, "logo.png");
      const mark = await uploadPng(markBlob, "logo-icon.png");
      const body = {
        logo_id: logo.photo_id,
        logo_url: logo.signed_url,
        icon_id: mark.photo_id,
        icon_url: mark.signed_url,
        logo_recipe: recipe,
      };
      // The backend re-derives mark.url from photo_id on read and discards
      // whatever we send for image marks (validate_logo_recipe always resets
      // it to "") — sending the full base64 data URL here just doubles the
      // upload's payload for nothing, since the image already went up via
      // uploadPng. Strip it for the wire only: `body` (used by onSaved, and
      // therefore this session's re-editing/preview) keeps the real data URL.
      const wireLogoRecipe =
        recipe.mark.type === "image"
          ? { ...recipe, mark: { ...recipe.mark, url: "" } }
          : recipe;
      await clientFetch("/api/v1/admin/config/", {
        method: "PATCH",
        body: JSON.stringify({ ...body, logo_recipe: wireLogoRecipe }),
      });
      onSaved(body);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the logo — you can upload a file instead.");
    } finally {
      setSaving(false);
    }
  }

  const handleClose = () => {
    if (!saving) onOpenChange(false);
  };

  // Escape closes the dialog, respecting the same close-guard as the X
  // button and backdrop click (handleClose no-ops while a save is in
  // flight). `saving` is a dependency so the listener's closure never goes
  // stale mid-save.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  // Move focus into the dialog on open, and restore it to whatever element
  // triggered the studio when it closes. ModalPortal is a bare portal (no
  // Radix Dialog underneath), so this focus-in/focus-out is what stands in
  // for the focus trap + focus restoration Radix would otherwise give us.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  const badgeSwatch = (fill: LogoRecipe["colors"]["badge"]) =>
    fill.type === "solid"
      ? fill.color
      : `linear-gradient(135deg, ${fill.from}, ${fill.to})`;

  return (
    <>
      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
            onClick={handleClose}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="logo-studio-title"
              tabIndex={-1}
              className="flex h-[92vh] max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 id="logo-studio-title" className="text-lg font-semibold">Logo Studio</h2>
                <div className="flex items-center gap-2">
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Use this logo
                  </Button>
                  <button
                    type="button"
                    onClick={handleClose}
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
                    <div
                      className={`rounded-lg border bg-white px-4 py-3 shadow-sm ${adjusting ? "cursor-move [&_[data-part]]:outline-dashed [&_[data-part]]:outline-1 [&_[data-part]]:outline-primary/40" : ""}`}
                    >
                      <LogoRenderer
                        recipe={recipe}
                        width={480}
                        svgRef={logoSvgRef}
                        onPointerDown={beginDrag}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                      />
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
                  <section className="space-y-2">
                    <Button
                      type="button" variant="outline" size="sm" className="w-full gap-2"
                      onClick={fetchSuggestions} disabled={suggesting}
                    >
                      {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      Suggest ideas
                    </Button>
                    {suggestions && (
                      <div className="grid grid-cols-2 gap-2" data-testid="logo-suggestions">
                        {suggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setRecipe({ ...s, name: recipe.name })}
                            className="rounded-md border bg-white p-2 hover:border-primary"
                          >
                            <LogoRenderer recipe={{ ...s, name: recipe.name }} width={120} />
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

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
                    <p className="text-sm font-medium">Tagline (optional)</p>
                    <input
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={recipe.tagline}
                      maxLength={120}
                      placeholder="e.g. Yoga for busy mothers"
                      onChange={(e) => patch({ tagline: e.target.value })}
                    />
                  </section>

                  <section className="space-y-1.5">
                    <p className="text-sm font-medium">Layout</p>
                    <div className="flex flex-wrap gap-1.5">
                      {LAYOUTS.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          aria-pressed={recipe.layout === l.id}
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
                          aria-pressed={recipe.mark.type === "initials"}
                          onClick={() => patch({ mark: { type: "initials", style: "plain" } })}
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
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Abstract</p>
                        <div className="grid grid-cols-6 gap-1">
                          {ABSTRACT_FAMILIES.map((family) => {
                            const active = recipe.mark.type === "abstract" && recipe.mark.family === family;
                            const seed = recipe.mark.type === "abstract" ? recipe.mark.seed : 1;
                            return (
                              <button
                                key={family}
                                type="button"
                                aria-label={`Abstract ${family}`}
                                aria-pressed={active}
                                onClick={() =>
                                  patch({ mark: { type: "abstract", family, seed: active ? seed + 1 : seed } })
                                }
                                className={`flex h-9 items-center justify-center rounded-md border ${active ? "border-primary bg-primary/10 text-primary" : "hover:border-foreground"}`}
                              >
                                <svg viewBox="0 0 24 24" width={20} height={20}>
                                  <AbstractMark family={family} seed={seed} color="currentColor" size={24} />
                                </svg>
                              </button>
                            );
                          })}
                        </div>
                        {recipe.mark.type === "abstract" && (
                          <p className="mt-1 text-xs text-muted-foreground">Click again to shuffle the shape.</p>
                        )}
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
                                    aria-pressed={active}
                                    onClick={() => patch({ mark: { type: "icon", icon: iconName, style: "outline" } })}
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
                            aria-pressed={recipe.badge.shape === b.id}
                            onClick={() => patch({ badge: { ...recipe.badge, shape: b.id } })}
                            className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.badge.shape === b.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
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
                          key={f.family}
                          type="button"
                          aria-pressed={recipe.typography.name.font === f.family}
                          onClick={() =>
                            patch({
                              typography: {
                                ...recipe.typography,
                                name: { ...recipe.typography.name, font: f.family },
                                tagline: { ...recipe.typography.tagline, font: f.family },
                              },
                            })
                          }
                          style={{ fontFamily: `'${f.family}', sans-serif` }}
                          className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.typography.name.font === f.family ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                        >
                          {f.family}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-1.5">
                    <p className="text-sm font-medium">Colors</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PALETTES(theme.primaryHex).map((pair) => {
                        const active = recipe.colors.palette_id === pair.id;
                        return (
                          <button
                            key={pair.id}
                            type="button"
                            title={pair.label}
                            aria-label={pair.label}
                            aria-pressed={active}
                            onClick={() => setRecipe((r) => applyPalette(r, pair))}
                            className={`h-7 w-7 rounded-full border-2 ${active ? "border-primary" : "border-transparent"}`}
                            style={{ background: badgeSwatch(pair.badge) }}
                          />
                        );
                      })}
                      <input
                        type="color"
                        aria-label="Custom badge color"
                        value={recipe.colors.badge.type === "solid" ? recipe.colors.badge.color : "#111827"}
                        onChange={(e) =>
                          patch({
                            colors: { ...recipe.colors, palette_id: null, badge: { type: "solid", color: e.target.value } },
                          })
                        }
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
                          aria-pressed={recipe.colors.text === hex}
                          onClick={() => patch({ colors: { ...recipe.colors, palette_id: null, text: hex } })}
                          className={`h-7 w-7 rounded-full border-2 ${recipe.colors.text === hex ? "border-primary" : "border-border"}`}
                          style={{ background: hex }}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Placement</p>
                      <button
                        type="button"
                        aria-pressed={adjusting}
                        onClick={() => setAdjusting((v) => !v)}
                        className={`rounded-md border px-2.5 py-1 text-xs ${adjusting ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
                      >
                        {adjusting ? "Done adjusting" : "Adjust placement"}
                      </button>
                    </div>
                    {adjusting && (
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <p>Drag the mark, name, or tagline in the top preview. It snaps back near center.</p>
                        <label className="block">
                          Mark size
                          <input
                            type="range" min={0.5} max={2} step={0.05}
                            value={recipe.elements.mark.scale}
                            onChange={(e) =>
                              setRecipe((r) => ({ ...r, elements: { ...r.elements, mark: { ...r.elements.mark, scale: Number(e.target.value) } } }))
                            }
                            className="w-full"
                          />
                        </label>
                        <label className="block">
                          Name size
                          <input
                            type="range" min={0.5} max={2} step={0.05}
                            value={recipe.elements.name.scale}
                            onChange={(e) =>
                              setRecipe((r) => ({ ...r, elements: { ...r.elements, name: { ...r.elements.name, scale: Number(e.target.value) } } }))
                            }
                            className="w-full"
                          />
                        </label>
                        <Button
                          type="button" variant="ghost" size="sm"
                          onClick={() =>
                            setRecipe((r) => ({
                              ...r,
                              elements: {
                                mark: { offset: [0, 0], scale: 1 },
                                name: { offset: [0, 0], scale: 1 },
                                tagline: { offset: [0, 0], scale: 1 },
                              },
                            }))
                          }
                        >
                          Reset placement
                        </Button>
                      </div>
                    )}
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
