"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { clientFetch } from "@/lib/api-client";
import { fetchLogoAiStatus, type LogoAiStatus } from "@/lib/logo/converse-api";
import { chatReducer, initialChatState } from "@/lib/logo/chat-state";
import { LOGO_FONTS, defaultRecipe } from "@/lib/logo/catalog";
import {
  applyRefinedDesign,
  composePackWall,
  composeWall,
  moreLikeThis,
  type Brief,
  type BrandPack,
  type BrandPackElement,
} from "@/lib/logo/composer";
import {
  imageToDataUrl,
  svgToPngBlob,
  uploadPng,
  type FontSpec,
} from "@/lib/logo/export";
import {
  canRedo,
  canUndo,
  createHistory,
  push,
  redo,
  reset,
  undo,
  type EditHistory,
} from "@/lib/logo/history";
import { isRecipe, migrateRecipe } from "@/lib/logo/migrate";
import { fetchLogoRefine, fetchRefineFinish } from "@/lib/logo/refine-api";
import {
  clearStudioSession,
  loadStudioSession,
  saveStudioSession,
} from "@/lib/logo/studio-session";
import { getThemePalette } from "@/lib/themes";
import type { AnyLogoRecipe, LogoRecipe } from "@/types/logo";
import type { TenantConfig } from "@/types/tenant";
import { logoViewBox } from "./logo-renderer";
import { renderRecipesToPngs } from "./render-draft";
import { StudioBrief } from "./studio-brief";
import { StudioChat } from "./studio-chat";
import { StudioEditor } from "./studio-editor";
import { StudioWall } from "./studio-wall";

type StudioStep = "brief" | "ideas" | "editor";

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
  const [editHistory, setEditHistory] = useState<EditHistory<LogoRecipe>>(() =>
    createHistory(recipe),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoSvgRef = useRef<SVGSVGElement>(null);
  const markSvgRef = useRef<SVGSVGElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // ── Brief → Ideas flow state ───────────────────────────────────────────
  const [step, setStep] = useState<StudioStep>("editor");
  const [brief, setBrief] = useState<Brief>({
    brandName: config.brand_name || "",
    niche: "",
    styleChips: [],
  });
  const [wall, setWall] = useState<LogoRecipe[] | null>(null);
  const [wallSeed, setWallSeed] = useState(1);
  const [wallDark, setWallDark] = useState(false);
  const [showingVariants, setShowingVariants] = useState(false);

  // ── Design with AI (paid-tier feature) ─────────────────────────────────
  const [logoAiStatus, setLogoAiStatus] = useState<LogoAiStatus | null>(null);
  const [chat, chatDispatch] = useReducer(chatReducer, initialChatState);
  const [chatOpen, setChatOpen] = useState(false);
  // Legacy AI Brand Pack (old saved sessions only): kept solely so a restored
  // session round-trips its pack and re-renders its wall as ordinary cards;
  // the studio never fetches or sets these anew.
  const [pack, setPack] = useState<BrandPack | null>(null);
  const [packSeed, setPackSeed] = useState<number | null>(null);

  // ── Editor draft's AI-sourced mark elements (session-only) ─────────────
  const [activeElements, setActiveElements] = useState<
    BrandPackElement[] | null
  >(null);

  // ── AI refinement (paid-tier feature) ───────────────────────────────────
  const [refining, setRefining] = useState(false);
  const [refineNotice, setRefineNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchLogoAiStatus()
      .then(setLogoAiStatus)
      .catch(() => setLogoAiStatus(null));
  }, [open]);

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
    const saved = loadStudioSession();
    if (saved) {
      setBrief(saved.brief);
      setPack(saved.pack);
      setPackSeed(saved.packSeed);
      setWallSeed(saved.wallSeed);
      const baseWall = composeWall(
        saved.brief,
        saved.wallSeed,
        24,
        theme.primaryHex,
      );
      // Legacy AI Brand Pack walls (old sessions) still render, folded in
      // front of the deterministic wall as ordinary cards.
      const legacyAiWall = saved.pack
        ? composePackWall(saved.pack, saved.brief, saved.packSeed ?? 1)
        : [];
      setWall([...legacyAiWall, ...baseWall]);
      const restoredRecipe =
        saved.recipe ?? seedRecipe(config, theme.primaryHex);
      setRecipe(restoredRecipe);
      setEditHistory(reset(restoredRecipe));
      setActiveElements(saved.elements);
      chatDispatch({ type: "hydrate", snapshot: saved.chat });
      setChatOpen(false);
      setStep(saved.step);
      return;
    }
    const seeded = seedRecipe(config, theme.primaryHex);
    setRecipe(seeded);
    setEditHistory(reset(seeded));
    setActiveElements(null);
    chatDispatch({ type: "hydrate", snapshot: null });
    setChatOpen(false);
    setBrief((b) => ({ ...b, brandName: config.brand_name || b.brandName }));
    setStep(isRecipe(config.logo_recipe) ? "editor" : "brief");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced (~500ms) write of the tracked session fields while the studio
  // is open — refresh-safe without spamming localStorage on every keystroke.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveStudioSession({
        step,
        brief,
        wallSeed,
        pack,
        packSeed,
        recipe,
        elements: activeElements,
        chat:
          chatOpen || chat.messages.length
            ? {
                stage: chat.stage,
                messages: chat.messages,
                pinnedIcon: chat.pinnedIcon,
                pinnedLockup: chat.pinnedLockup,
              }
            : null,
      });
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    open,
    step,
    brief,
    wallSeed,
    pack,
    packSeed,
    recipe,
    activeElements,
    chatOpen,
    chat,
  ]);

  function patch(part: Partial<LogoRecipe>, coalesceKey?: string) {
    const next = { ...recipe, ...part };
    setRecipe(next);
    setEditHistory((h) => push(h, next, coalesceKey ?? null));
    if (part.mark) setActiveElements(null);
  }

  function updateRecipe(
    updater: (r: LogoRecipe) => LogoRecipe,
    coalesceKey?: string,
  ) {
    const next = updater(recipe);
    setRecipe(next);
    setEditHistory((h) => push(h, next, coalesceKey ?? null));
    if (next.mark !== recipe.mark) setActiveElements(null);
  }

  function handleUndo() {
    setEditHistory((h) => {
      const next = undo(h);
      setRecipe(next.present);
      return next;
    });
  }

  function handleRedo() {
    setEditHistory((h) => {
      const next = redo(h);
      setRecipe(next.present);
      return next;
    });
  }

  // The deterministic wall is instant, offline, and free — it's the studio's
  // baseline for every coach. Paid-tier coaches additionally get the staged
  // Design-with-AI chat (StudioChat), which converges on ONE bespoke logo.
  function regenerateWall() {
    const seed = 1 + Math.floor(Math.random() * 1_000_000);
    setWallSeed(seed);
    setWall(composeWall(brief, seed, 24, theme.primaryHex));
    setShowingVariants(false);
  }

  function startIdeas() {
    regenerateWall();
    setPack(null);
    setPackSeed(null);
    chatDispatch({ type: "hydrate", snapshot: null });
    setChatOpen(false);
    setStep("ideas");
  }

  function handleStartOver() {
    clearStudioSession();
    setBrief({ brandName: config.brand_name || "", niche: "", styleChips: [] });
    setWall(null);
    setPack(null);
    setPackSeed(null);
    chatDispatch({ type: "hydrate", snapshot: null });
    setChatOpen(false);
  }

  function handleMoreLikeThis(base: LogoRecipe) {
    const seed = 1 + Math.floor(Math.random() * 1_000_000);
    setWall(moreLikeThis(base, brief, seed));
    setShowingVariants(true);
  }

  function handleCustomize(chosen: LogoRecipe, elements?: BrandPackElement[]) {
    setRecipe(chosen);
    setEditHistory(reset(chosen));
    setActiveElements(elements ?? null);
    setStep("editor");
  }

  async function handleRefine(instruction: string) {
    setRefining(true);
    setRefineNotice(null);
    const baseRecipe = recipe;
    try {
      const resp = await fetchLogoRefine(
        baseRecipe,
        activeElements,
        instruction,
      );
      setLogoAiStatus((s) =>
        s ? { ...s, refine_remaining: resp.refine_remaining } : s,
      );
      if (resp.source !== "ai" || !resp.design) {
        setRefineNotice(
          resp.source === "quota_exhausted"
            ? "You've used this month's AI refinements. More next month."
            : "Couldn't refine the design — try again.",
        );
        return;
      }
      let design = resp.design;
      // Two-pass (Task 12): render the draft and let the AI critique its own
      // work. Any failure keeps the draft the client already holds — the
      // coach's editor never lands on a blank refinement.
      if (resp.phase === "draft" && resp.token) {
        const draftRecipe = applyRefinedDesign(baseRecipe, design);
        try {
          const images = await renderRecipesToPngs([draftRecipe], "name");
          const final = await fetchRefineFinish(resp.token, images);
          if (final.source === "ai" && final.design) design = final.design;
        } catch {
          // keep the draft `design`
        }
      }
      const applied = applyRefinedDesign(baseRecipe, design);
      setRecipe(applied);
      setEditHistory((h) => push(h, applied, null));
      setActiveElements(design.mark.elements ?? null);
      setRefineNotice(design.rationale);
    } catch {
      setRefineNotice("Couldn't reach the design studio just now.");
    } finally {
      setRefining(false);
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
      clearStudioSession();
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
  // stale mid-save. (The canvas stopPropagation()s Escape while an element
  // is selected, so deselect wins over close.)
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  // Undo/redo — active only while the editor step is open (including
  // inside text inputs, so typed edits are undoable too). Detaches when
  // the studio closes or leaves the editor step. handleUndo/handleRedo
  // read editHistory via functional setState, so this listener never goes
  // stale even though editHistory isn't a dependency.
  useEffect(() => {
    if (!open || step !== "editor") return;
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, step]);

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
                    onStartOver={handleStartOver}
                  />
                </div>
              )}

              {step === "ideas" && wall && (
                <div className="flex min-h-0 flex-1">
                  <div className="min-w-0 flex-1">
                    <StudioWall
                      wall={wall}
                      dark={wallDark}
                      onToggleDark={() => setWallDark((v) => !v)}
                      onShuffle={regenerateWall}
                      onCustomize={handleCustomize}
                      onMoreLikeThis={handleMoreLikeThis}
                      showingVariants={showingVariants}
                      onShowAll={regenerateWall}
                      logoAiStatus={logoAiStatus}
                      onOpenChat={() => setChatOpen(true)}
                    />
                  </div>
                  {chatOpen && (
                    <StudioChat
                      open={chatOpen}
                      state={chat}
                      dispatch={chatDispatch}
                      brief={brief}
                      brandName={brief.brandName || config.brand_name}
                      status={logoAiStatus}
                      onUseDesign={(chosen, elements) => {
                        handleCustomize(chosen, elements);
                        setChatOpen(false);
                      }}
                      onStatusChange={(turns) =>
                        setLogoAiStatus((s) =>
                          s ? { ...s, turns_remaining: turns } : s,
                        )
                      }
                      onClose={() => setChatOpen(false)}
                    />
                  )}
                </div>
              )}

              {step === "editor" && (
                <StudioEditor
                  recipe={recipe}
                  onPatch={patch}
                  onUpdate={updateRecipe}
                  canUndo={canUndo(editHistory)}
                  canRedo={canRedo(editHistory)}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  logoAiStatus={logoAiStatus}
                  refining={refining}
                  refineNotice={refineNotice}
                  onRefine={handleRefine}
                  primaryHex={theme.primaryHex}
                  onGetNewIdeas={() => setStep("brief")}
                  onUploadMark={handleMarkUpload}
                  logoSvgRef={logoSvgRef}
                  markSvgRef={markSvgRef}
                />
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
