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
  fontEntry,
  initialsFor,
} from "@/lib/logo/catalog";
import { ABSTRACT_FAMILIES } from "@/lib/logo/abstract";
import { composeWall, moreLikeThis, type Brief } from "@/lib/logo/composer";
import {
  imageToDataUrl,
  svgToPngBlob,
  uploadPng,
  type FontSpec,
} from "@/lib/logo/export";
import { isRecipe, migrateRecipe } from "@/lib/logo/migrate";
import { getThemePalette } from "@/lib/themes";
import type {
  AnyLogoRecipe,
  BadgeShape,
  FontWeight,
  LogoRecipe,
  RecipeLayout,
  TextCase,
} from "@/types/logo";
import type { TenantConfig } from "@/types/tenant";
import { AbstractMark } from "./abstract-mark";
import { logoViewBox, LogoRenderer, MarkRenderer } from "./logo-renderer";
import { StudioBrief } from "./studio-brief";
import { StudioWall } from "./studio-wall";

type StudioStep = "brief" | "ideas" | "editor";

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

export function LogoStudio({
  open,
  onOpenChange,
  config,
  onSaved,
}: LogoStudioProps) {
  const theme = getThemePalette(config.theme);
  const [recipe, setRecipe] = useState<LogoRecipe>(() =>
    seedRecipe(config, theme.primaryHex),
  );
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
  // ── AI-first flow state ────────────────────────────────────────────────
  const [step, setStep] = useState<StudioStep>("editor");
  const [brief, setBrief] = useState<Brief>({
    brandName: config.brand_name || "",
    niche: "",
    styleChips: [],
    vibe: "",
  });
  const [wall, setWall] = useState<LogoRecipe[] | null>(null);
  const [wallDark, setWallDark] = useState(false);
  const [showingVariants, setShowingVariants] = useState(false);
  // Bumped on every wall regeneration; an AI top-up landing after a bump is
  // stale and must be dropped.
  const wallGenRef = useRef(0);

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
      (f) =>
        `family=${encodeURIComponent(f.family)}:wght@${f.weights.join(";")}`,
    ).join("&")}&display=swap`;
    document.head.appendChild(link);
  }, [open]);

  // Re-seed the recipe from the latest config every time the studio opens, so
  // a stale in-memory recipe (from a prior session, or a config change since
  // mount) doesn't linger — this component stays mounted across opens.
  // A coach with a saved design lands in the Editor; a fresh coach starts at
  // the Brief (the AI-first anchor flow).
  useEffect(() => {
    if (!open) return;
    setRecipe(seedRecipe(config, theme.primaryHex));
    setBrief((b) => ({ ...b, brandName: config.brand_name || b.brandName }));
    setStep(isRecipe(config.logo_recipe) ? "editor" : "brief");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (part: Partial<LogoRecipe>) =>
    setRecipe((r) => ({ ...r, ...part }));

  function beginDrag(e: React.PointerEvent<SVGSVGElement>) {
    if (!adjusting) return;
    const part = (e.target as Element)
      .closest("[data-part]")
      ?.getAttribute("data-part") as "mark" | "name" | "tagline" | null;
    if (!part) return;
    const base = recipe.elements[part].offset;
    dragRef.current = {
      part,
      startX: e.clientX,
      startY: e.clientY,
      base: [...base] as [number, number],
    };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = e.currentTarget;
    // convert screen px to viewBox units
    const scale =
      logoViewBox(recipe.layout).w / svg.getBoundingClientRect().width;
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

  /** Fire-and-forget AI top-up: when the backend has an API key, its picks
   * replace the first slots of the deterministic wall. Fallback-source
   * responses are ignored (the composer wall is already better and free);
   * errors are silent; stale responses (coach shuffled meanwhile) dropped. */
  function aiTopUp(generation: number) {
    void clientFetch<{ suggestions: AnyLogoRecipe[]; source: string }>(
      "/api/v1/admin/config/logo-suggestions/",
      { method: "POST", body: JSON.stringify({}) },
    )
      .then((data) => {
        if (wallGenRef.current !== generation || data.source !== "ai") return;
        const aiRecipes = data.suggestions.map((s) => ({
          ...migrateRecipe(s),
          name: brief.brandName || "My Brand",
        }));
        setWall((current) =>
          current
            ? [...aiRecipes, ...current.slice(aiRecipes.length)]
            : current,
        );
      })
      .catch(() => {
        /* AI is optional — the wall is already on screen */
      });
  }

  function regenerateWall() {
    const seed = 1 + Math.floor(Math.random() * 1_000_000);
    const generation = ++wallGenRef.current;
    setWall(composeWall(brief, seed, 24, theme.primaryHex));
    setShowingVariants(false);
    aiTopUp(generation);
  }

  function startIdeas() {
    regenerateWall();
    setStep("ideas");
  }

  function handleMoreLikeThis(base: LogoRecipe) {
    const seed = 1 + Math.floor(Math.random() * 1_000_000);
    wallGenRef.current++;
    setWall(moreLikeThis(base, brief, seed));
    setShowingVariants(true);
  }

  function handleCustomize(chosen: LogoRecipe) {
    setRecipe(chosen);
    setStep("editor");
  }

  async function handleMarkUpload(file: File) {
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    try {
      const dataUrl = await imageToDataUrl(objectUrl);
      // Persist the original file so the mark survives re-edit sessions; the
      // in-memory data URL is what the preview/export uses this session.
      const uploaded = await uploadPng(file, file.name, file.type);
      patch({
        mark: { type: "image", photo_id: uploaded.photo_id, url: dataUrl },
      });
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
        {
          family: recipe.typography.name.font,
          weight: recipe.typography.name.weight,
        },
        ...(recipe.tagline.trim()
          ? [
              {
                family: recipe.typography.tagline.font,
                weight: recipe.typography.tagline.weight,
              },
            ]
          : []),
      ];
      const logoBlob = await svgToPngBlob(
        logoSvgRef.current,
        vb.w * 2,
        vb.h * 2,
        fonts,
      );
      const markBlob = await svgToPngBlob(
        markSvgRef.current,
        1024,
        1024,
        fonts,
      );
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
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the logo — you can upload a file instead.",
      );
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
              className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-background shadow-2xl outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="flex items-center gap-6">
                  <h2 id="logo-studio-title" className="text-lg font-semibold">
                    Logo Studio
                  </h2>
                  <nav
                    className="flex items-center gap-1"
                    aria-label="Studio steps"
                  >
                    {(
                      [
                        { id: "brief", label: "1 · Brief" },
                        { id: "ideas", label: "2 · Ideas" },
                        { id: "editor", label: "3 · Editor" },
                      ] as { id: StudioStep; label: string }[]
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={step === s.id}
                        disabled={s.id === "ideas" && !wall}
                        onClick={() => setStep(s.id)}
                        className={`rounded-md px-2.5 py-1.5 text-sm ${step === s.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground disabled:opacity-40"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </nav>
                </div>
                <div className="flex items-center gap-2">
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  {step === "editor" && (
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="gap-2"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Use this logo
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label="Close Logo Studio"
                    onClick={handleClose}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {step === "brief" && (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <StudioBrief
                    brief={brief}
                    onChange={setBrief}
                    onSubmit={startIdeas}
                  />
                </div>
              )}

              {step === "ideas" && wall && (
                <div className="min-h-0 flex-1">
                  <StudioWall
                    wall={wall}
                    dark={wallDark}
                    onToggleDark={() => setWallDark((v) => !v)}
                    onShuffle={regenerateWall}
                    onCustomize={handleCustomize}
                    onMoreLikeThis={handleMoreLikeThis}
                    showingVariants={showingVariants}
                    onShowAll={regenerateWall}
                  />
                </div>
              )}

              <div
                className={`min-h-0 flex-1 ${step === "editor" ? "flex" : "hidden"}`}
              >
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
                      <span className="text-xs text-muted-foreground">
                        Browser tab
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="overflow-hidden rounded-2xl shadow-md">
                        <MarkRenderer
                          recipe={recipe}
                          size={64}
                          svgRef={markSvgRef}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        App icon
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Controls rail ──────────────────────────────────────────── */}
                <div className="w-80 shrink-0 space-y-6 overflow-y-auto border-l p-5">
                  <section>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => setStep("brief")}
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Get new ideas
                    </Button>
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
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          ["plain", "monogram", "split", "overlap"] as const
                        ).map((style) => {
                          const active =
                            recipe.mark.type === "initials" &&
                            recipe.mark.style === style;
                          return (
                            <button
                              key={style}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                patch({ mark: { type: "initials", style } })
                              }
                              className={`rounded-md border px-2.5 py-1.5 text-xs capitalize ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                            >
                              {initialsFor(recipe.name)} {style}
                            </button>
                          );
                        })}
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={(e) =>
                            e.target.files?.[0] &&
                            handleMarkUpload(e.target.files[0])
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => fileRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" /> Your own
                        </Button>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                          Abstract
                        </p>
                        <div className="grid grid-cols-6 gap-1">
                          {ABSTRACT_FAMILIES.map((family) => {
                            const active =
                              recipe.mark.type === "abstract" &&
                              recipe.mark.family === family;
                            const seed =
                              recipe.mark.type === "abstract"
                                ? recipe.mark.seed
                                : 1;
                            return (
                              <button
                                key={family}
                                type="button"
                                aria-label={`Abstract ${family}`}
                                aria-pressed={active}
                                onClick={() =>
                                  patch({
                                    mark: {
                                      type: "abstract",
                                      family,
                                      seed: active ? seed + 1 : seed,
                                    },
                                  })
                                }
                                className={`flex h-9 items-center justify-center rounded-md border ${active ? "border-primary bg-primary/10 text-primary" : "hover:border-foreground"}`}
                              >
                                <svg viewBox="0 0 24 24" width={20} height={20}>
                                  <AbstractMark
                                    family={family}
                                    seed={seed}
                                    color="currentColor"
                                    size={24}
                                  />
                                </svg>
                              </button>
                            );
                          })}
                        </div>
                        {recipe.mark.type === "abstract" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Click again to shuffle the shape.
                          </p>
                        )}
                      </div>
                      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                        {ICON_GROUPS.map((group) => (
                          <div key={group.label}>
                            <p className="mb-1 text-xs text-muted-foreground">
                              {group.label}
                            </p>
                            <div className="grid grid-cols-8 gap-1">
                              {group.icons.map((iconName) => {
                                const Icon = LOGO_ICONS[iconName];
                                const active =
                                  recipe.mark.type === "icon" &&
                                  recipe.mark.icon === iconName;
                                return (
                                  <button
                                    key={iconName}
                                    type="button"
                                    aria-label={iconName}
                                    aria-pressed={active}
                                    onClick={() =>
                                      patch({
                                        mark: {
                                          type: "icon",
                                          icon: iconName,
                                          style: "outline",
                                        },
                                      })
                                    }
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
                      {recipe.mark.type === "icon" && (
                        <div className="flex gap-1.5">
                          {(["outline", "solid"] as const).map((style) => {
                            const active =
                              recipe.mark.type === "icon" &&
                              recipe.mark.style === style;
                            return (
                              <button
                                key={style}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  recipe.mark.type === "icon" &&
                                  patch({ mark: { ...recipe.mark, style } })
                                }
                                className={`rounded-md border px-2.5 py-1 text-xs capitalize ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                              >
                                {style}
                              </button>
                            );
                          })}
                        </div>
                      )}
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
                            onClick={() =>
                              patch({ badge: { ...recipe.badge, shape: b.id } })
                            }
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
                    {(
                      [
                        "Modern",
                        "Elegant",
                        "Bold",
                        "Playful",
                        "Minimal",
                      ] as const
                    ).map((vibe) => (
                      <div key={vibe}>
                        <p className="mb-1 text-xs text-muted-foreground">
                          {vibe}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {LOGO_FONTS.filter((f) => f.vibe === vibe).map(
                            (f) => (
                              <button
                                key={f.family}
                                type="button"
                                aria-pressed={
                                  recipe.typography.name.font === f.family
                                }
                                onClick={() =>
                                  patch({
                                    typography: {
                                      ...recipe.typography,
                                      name: {
                                        ...recipe.typography.name,
                                        font: f.family,
                                        // clamp the weight if the new family doesn't ship it
                                        weight: f.weights.includes(
                                          recipe.typography.name.weight,
                                        )
                                          ? recipe.typography.name.weight
                                          : 700,
                                      },
                                      tagline: {
                                        ...recipe.typography.tagline,
                                        font: f.family,
                                        weight: f.weights.includes(
                                          recipe.typography.tagline.weight,
                                        )
                                          ? recipe.typography.tagline.weight
                                          : 500,
                                      },
                                    },
                                  })
                                }
                                style={{
                                  fontFamily: `'${f.family}', sans-serif`,
                                }}
                                className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.typography.name.font === f.family ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                              >
                                {f.family}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center gap-3 pt-1">
                      <label className="flex-1 text-xs text-muted-foreground">
                        Weight
                        <select
                          className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                          value={recipe.typography.name.weight}
                          onChange={(e) =>
                            patch({
                              typography: {
                                ...recipe.typography,
                                name: {
                                  ...recipe.typography.name,
                                  weight: Number(e.target.value) as FontWeight,
                                },
                              },
                            })
                          }
                        >
                          {fontEntry(recipe.typography.name.font).weights.map(
                            (w) => (
                              <option key={w} value={w}>
                                {
                                  {
                                    400: "Regular",
                                    500: "Medium",
                                    600: "Semibold",
                                    700: "Bold",
                                    800: "Extra bold",
                                  }[w]
                                }
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="flex-1 text-xs text-muted-foreground">
                        Case
                        <select
                          className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                          value={recipe.typography.name.case}
                          onChange={(e) =>
                            patch({
                              typography: {
                                ...recipe.typography,
                                name: {
                                  ...recipe.typography.name,
                                  case: e.target.value as TextCase,
                                },
                              },
                            })
                          }
                        >
                          <option value="none">As typed</option>
                          <option value="title">Title Case</option>
                          <option value="upper">UPPERCASE</option>
                        </select>
                      </label>
                    </div>
                    <label className="block text-xs text-muted-foreground">
                      Letter spacing
                      <input
                        type="range"
                        min={-0.05}
                        max={0.3}
                        step={0.01}
                        value={recipe.typography.name.tracking}
                        onChange={(e) =>
                          patch({
                            typography: {
                              ...recipe.typography,
                              name: {
                                ...recipe.typography.name,
                                tracking: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-full"
                      />
                    </label>
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
                            onClick={() =>
                              setRecipe((r) => applyPalette(r, pair))
                            }
                            className={`h-7 w-7 rounded-full border-2 ${active ? "border-primary" : "border-transparent"}`}
                            style={{ background: badgeSwatch(pair.badge) }}
                          />
                        );
                      })}
                      <input
                        type="color"
                        aria-label="Custom badge color"
                        value={
                          recipe.colors.badge.type === "solid"
                            ? recipe.colors.badge.color
                            : "#111827"
                        }
                        onChange={(e) =>
                          patch({
                            colors: {
                              ...recipe.colors,
                              palette_id: null,
                              badge: { type: "solid", color: e.target.value },
                            },
                          })
                        }
                        className="h-7 w-7 cursor-pointer rounded-full border p-0"
                      />
                    </div>
                    <p className="pt-1 text-xs text-muted-foreground">
                      Name color
                    </p>
                    <div className="flex gap-1.5">
                      {TEXT_COLORS(theme.primaryHex).map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`Name color ${hex}`}
                          aria-pressed={recipe.colors.text === hex}
                          onClick={() =>
                            patch({
                              colors: {
                                ...recipe.colors,
                                palette_id: null,
                                text: hex,
                              },
                            })
                          }
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
                        <p>
                          Drag the mark, name, or tagline in the top preview. It
                          snaps back near center.
                        </p>
                        <label className="block">
                          Mark size
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.05}
                            value={recipe.elements.mark.scale}
                            onChange={(e) =>
                              setRecipe((r) => ({
                                ...r,
                                elements: {
                                  ...r.elements,
                                  mark: {
                                    ...r.elements.mark,
                                    scale: Number(e.target.value),
                                  },
                                },
                              }))
                            }
                            className="w-full"
                          />
                        </label>
                        <label className="block">
                          Name size
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.05}
                            value={recipe.elements.name.scale}
                            onChange={(e) =>
                              setRecipe((r) => ({
                                ...r,
                                elements: {
                                  ...r.elements,
                                  name: {
                                    ...r.elements.name,
                                    scale: Number(e.target.value),
                                  },
                                },
                              }))
                            }
                            className="w-full"
                          />
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
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
