"use client";

// The AI door: the third logo option in the wizard. Four states —
//   locked   -> plan cards (GET platform plans), a click PATCHes current_step
//               then redirects to Stripe checkout.
//   syncing  -> after the `?upgraded=1` round-trip, POST the session_id to
//               checkout/sync/ (server retrieves the session and activates
//               the plan itself — no webhook needed), with the wizard-state
//               poll kept as fallback until it flips (or times out).
//   chat     -> a lean, staged Design-with-AI conversation (icon -> name ->
//               tagline), reusing the same converse/finish two-pass the Logo
//               Studio uses (render-draft.tsx's renderDraftPngs).
//   picked   -> the coach already has an AI logo (value.mode === "ai"):
//               summary card + a "change" link back into chat.
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  LogoRenderer,
  MarkRenderer,
  logoViewBox,
} from "@/components/logo/logo-renderer";
import { svgToPngBlob } from "@/lib/logo/export";
import { composeIconPreview, type ConverseDesign } from "@/lib/logo/composer";
import { fontsFor, renderDraftPngs } from "@/lib/logo/render-draft";
import { listPlans, type PlanSummary } from "@/lib/api/billing-platform";
import {
  designRecipe,
  fetchWizardLogoStatus,
  wizardCheckout,
  wizardCheckoutSync,
  wizardConverse,
  wizardConverseFinish,
  wizardLogoUpload,
} from "@/lib/wizard/logo-api";
import { patchWizardState, readWizardState } from "@/lib/wizard/api";
import type { WizardLogoAnswer } from "@/lib/wizard/types";
import { THEME_SWATCHES } from "@/lib/wizard/wizard-themes";
import type { LogoRecipe } from "@/types/logo";

import { OptionCard } from "./steps";

type ChatStage = "icon" | "name" | "tagline";
const STAGES: ChatStage[] = ["icon", "name", "tagline"];

type DoorState = "loading" | "locked" | "syncing" | "chat" | "picked";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  designs?: ConverseDesign[];
  stage?: ChatStage;
}

const SYNC_POLL_MS = 2000;
const SYNC_TIMEOUT_MS = 15000;

function formatPrice(currency: string, amountCents: number | null): string {
  const amount = (amountCents ?? 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Off-screen rasterize the FINAL picked lockup at export resolution — a
 * 1024px-wide lockup PNG and a square 512px mark-only icon PNG. Same
 * createRoot/flushSync/nextFrame idiom as render-draft.tsx's
 * renderRecipesToPngs (which is sized for draft-preview cards, not final
 * export), reusing its `fontsFor` + the shared `svgToPngBlob`. */
async function renderFinalPngs(
  recipe: LogoRecipe,
): Promise<{ lockup: Blob; icon: Blob }> {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;pointer-events:none;opacity:0;";
  document.body.appendChild(container);
  const root = createRoot(container);
  let lockupSvg: SVGSVGElement | null = null;
  let iconSvg: SVGSVGElement | null = null;
  try {
    flushSync(() => {
      root.render(
        <>
          <LogoRenderer
            recipe={recipe}
            width={1024}
            svgRef={(el) => {
              lockupSvg = el;
            }}
          />
          <MarkRenderer
            recipe={recipe}
            size={512}
            svgRef={(el) => {
              iconSvg = el;
            }}
          />
        </>,
      );
    });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (!lockupSvg || !iconSvg) throw new Error("Render failed");
    const vb = logoViewBox(recipe.layout);
    const fonts = fontsFor(recipe);
    const lockup = await svgToPngBlob(
      lockupSvg,
      1024,
      Math.round((1024 * vb.h) / vb.w),
      fonts,
    );
    const icon = await svgToPngBlob(iconSvg, 512, 512, fonts);
    return { lockup, icon };
  } finally {
    root.unmount();
    container.remove();
  }
}

export function AiLogoDoor({
  token,
  brand,
  niche,
  theme,
  value,
  onPicked,
  initialUpgraded,
  checkoutSessionId,
}: {
  token: string;
  brand: string;
  niche?: string;
  theme?: string;
  value?: WizardLogoAnswer;
  onPicked: (logo: WizardLogoAnswer) => void;
  initialUpgraded?: boolean;
  checkoutSessionId?: string;
}) {
  const t = useTranslations("wizard");
  const swatch = THEME_SWATCHES[theme ?? ""] ?? THEME_SWATCHES.ocean;
  const [doorState, setDoorState] = useState<DoorState>(
    value?.mode === "ai" ? "picked" : "loading",
  );
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [checkoutBusyId, setCheckoutBusyId] = useState<number | null>(null);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const [doorError, setDoorError] = useState<string | null>(null);

  // Chat sub-state.
  const [stage, setStage] = useState<ChatStage>("icon");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pinnedIcon, setPinnedIcon] = useState<ConverseDesign | null>(null);
  const [pinnedLockup, setPinnedLockup] = useState<ConverseDesign | null>(null);
  const [committed, setCommitted] = useState(false);
  const [input, setInput] = useState("");
  const [turnBusy, setTurnBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const resetChat = useCallback(() => {
    setStage("icon");
    setMessages([]);
    setPinnedIcon(null);
    setPinnedLockup(null);
    setCommitted(false);
    setInput("");
    setNotice(null);
  }, []);

  // ── loading -> locked | syncing | chat ────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSync = useCallback(() => {
    setDoorState("syncing");
    setSyncTimedOut(false);
    const startedAt = Date.now();
    if (pollRef.current) clearInterval(pollRef.current);
    // Active probe first: hand the session_id back so Django retrieves the
    // session and activates the plan itself. Without it, unlocking depends
    // on the checkout webhook — which local dev never receives (needs
    // `make stripe-listen`) and which prod can deliver after the redirect.
    if (checkoutSessionId) {
      wizardCheckoutSync(token, checkoutSessionId)
        .then((res) => {
          if (res.has_paid_platform_plan) {
            if (pollRef.current) clearInterval(pollRef.current);
            setDoorState("chat");
          }
        })
        .catch(() => {
          // probe failed — the poll below stays the fallback
        });
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await readWizardState(token);
        if (res.has_paid_platform_plan) {
          if (pollRef.current) clearInterval(pollRef.current);
          setDoorState("chat");
          return;
        }
      } catch {
        // transient failure — keep polling until the timeout below fires
      }
      if (Date.now() - startedAt >= SYNC_TIMEOUT_MS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setSyncTimedOut(true);
      }
    }, SYNC_POLL_MS);
  }, [token, checkoutSessionId]);

  const loadLocked = useCallback(() => {
    setDoorState("locked");
    listPlans()
      .then((res) => setPlans(res.plans.filter((p) => !p.is_free)))
      .catch(() => setDoorError(t("common.errors.generic")));
  }, [t]);

  useEffect(() => {
    if (value?.mode === "ai") return; // already picked — nothing to resolve
    let cancelled = false;
    fetchWizardLogoStatus(token)
      .then((status) => {
        if (cancelled) return;
        if (status.paid) setDoorState("chat");
        else if (initialUpgraded) startSync();
        else loadLocked();
      })
      .catch(() => {
        if (cancelled) return;
        if (initialUpgraded) startSync();
        else loadLocked();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  // ── locked: pick a plan -> checkout round-trip ────────────────────────
  async function startCheckoutFor(plan: PlanSummary) {
    if (checkoutBusyId) return;
    setCheckoutBusyId(plan.id);
    setDoorError(null);
    try {
      await patchWizardState(token, { current_step: "logo" });
      const res = await wizardCheckout(token, plan.id);
      window.location.assign(res.checkout_url);
    } catch {
      setDoorError(t("common.errors.generic"));
      setCheckoutBusyId(null);
    }
  }

  // ── chat: one converse turn (draft -> render -> critique, same as studio) ─
  async function runTurn() {
    const text = input.trim();
    if (!text || turnBusy) return;
    setNotice(null);
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTurnBusy(true);
    const transcript = messages
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text }));
    const pinned =
      stage === "icon"
        ? {}
        : stage === "name"
          ? {
              mark_elements: pinnedIcon?.elements,
              mark_paths: pinnedIcon?.paths,
            }
          : {
              mark_elements: pinnedIcon?.elements,
              mark_paths: pinnedIcon?.paths,
              lockup: pinnedLockup,
            };
    try {
      const resp = await wizardConverse(token, {
        stage,
        message: text,
        transcript,
        pinned,
      });
      if (resp.source !== "ai") {
        const msg =
          resp.source === "quota_exhausted"
            ? t("aiChat.quota")
            : t("common.errors.generic");
        setMessages((m) => [...m, { role: "assistant", text: msg }]);
        setNotice(msg);
        return;
      }
      if (resp.phase === "final" || !resp.token) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: resp.message,
            designs: resp.designs,
            stage,
          },
        ]);
        return;
      }
      // Two-pass: render the drafts, let the AI critique its own work. Any
      // failure short-circuits to the drafts already in hand.
      try {
        const images = await renderDraftPngs(resp.designs, stage, brand);
        const final = await wizardConverseFinish(token, resp.token, images);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: final.source === "error" ? resp.message : final.message,
            designs: final.designs.length ? final.designs : resp.designs,
            stage,
          },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: resp.message,
            designs: resp.designs,
            stage,
          },
        ]);
      }
    } catch {
      const msg = t("common.errors.generic");
      setMessages((m) => [...m, { role: "assistant", text: msg }]);
      setNotice(msg);
    } finally {
      setTurnBusy(false);
    }
  }

  function pick(design: ConverseDesign) {
    if (stage === "icon") {
      setPinnedIcon(design);
      setStage("name");
    } else if (stage === "name") {
      setPinnedLockup(design);
      setStage("tagline");
    } else {
      setPinnedLockup(design);
      setCommitted(true);
    }
  }

  async function useThisLogo() {
    if (!pinnedLockup || finalizing) return;
    setFinalizing(true);
    setNotice(null);
    try {
      const recipe = designRecipe(pinnedLockup, brand);
      const { lockup, icon } = await renderFinalPngs(recipe);
      const [logoUp, iconUp] = await Promise.all([
        wizardLogoUpload(token, "logo", lockup),
        wizardLogoUpload(token, "icon", icon),
      ]);
      onPicked({
        mode: "ai",
        curated_id: null,
        recipe,
        export_keys: { logo: logoUp.key, icon: iconUp.key },
      });
      setDoorState("picked");
    } catch {
      setNotice(t("common.errors.generic"));
    } finally {
      setFinalizing(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────

  if (doorState === "loading") {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-foreground/[0.15] px-4 py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (doorState === "locked") {
    return (
      <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4">
        <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
          <Sparkles className="h-3.5 w-3.5" style={{ color: swatch.primary }} />
          {t("upgrade.title")}
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          {t("upgrade.subtitle")}
        </p>
        {doorError && (
          <p className="mt-2 text-[12px] text-destructive">{doorError}</p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {plans.map((plan) => (
            <OptionCard
              key={plan.id}
              selected={false}
              onSelect={() => startCheckoutFor(plan)}
              title={plan.name}
              subtitle={`${formatPrice(plan.currency, plan.amount_cents)}/mo — ${t("upgrade.cta")}`}
              badge={checkoutBusyId === plan.id ? "…" : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  if (doorState === "syncing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-6 text-center">
        {syncTimedOut ? (
          <>
            <p className="text-[13px] text-muted-foreground">
              {t("upgrade.syncSlow")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startSync}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("upgrade.retry")}
            </Button>
          </>
        ) : (
          <>
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{ color: swatch.primary }}
            />
            <p className="text-[13px] text-muted-foreground">
              {t("upgrade.syncing")}
            </p>
          </>
        )}
      </div>
    );
  }

  if (doorState === "picked" && value?.mode === "ai" && value.recipe) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-primary bg-primary/[0.06] p-3">
        <span className="flex items-center justify-center rounded-lg bg-white p-2">
          <LogoRenderer recipe={value.recipe} width={140} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">
            {t("logo.ai.title")}
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            {t("logo.selected")}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            resetChat();
            setDoorState("chat");
          }}
          className="flex-shrink-0 text-[12px] font-medium text-primary hover:underline"
        >
          {t("aiChat.change")}
        </button>
      </div>
    );
  }

  // chat
  const lastWithDesigns = [...messages]
    .reverse()
    .find((m) => m.designs?.length);
  const showCards =
    !committed && Boolean(lastWithDesigns) && lastWithDesigns!.stage === stage;
  const showNicheStarter =
    stage === "icon" && messages.length === 0 && Boolean(niche);

  return (
    <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4">
      <div className="mb-3 flex items-center justify-center gap-2">
        {STAGES.map((s, i) => {
          const activeIdx = STAGES.indexOf(stage);
          return (
            <span key={s} className="flex items-center gap-2">
              <span
                className={`flex h-2 w-2 rounded-full transition-colors ${activeIdx >= i ? "" : "bg-foreground/15"}`}
                style={
                  activeIdx >= i ? { background: swatch.primary } : undefined
                }
                aria-label={t(`aiChat.stages.${s}`)}
              />
              {i < STAGES.length - 1 && (
                <span className="h-px w-4 bg-foreground/15" />
              )}
            </span>
          );
        })}
      </div>

      {committed && pinnedLockup ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center rounded-lg bg-white p-3">
            <LogoRenderer
              recipe={designRecipe(pinnedLockup, brand)}
              width={220}
            />
          </div>
          {notice && <p className="text-[12px] text-destructive">{notice}</p>}
          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="brand"
              className="flex-1"
              onClick={useThisLogo}
              loading={finalizing}
            >
              {t("aiChat.useThis")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCommitted(false)}
              disabled={finalizing}
            >
              {t("aiChat.change")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {messages.length > 0 && (
            <div className="mb-3 flex max-h-40 flex-col gap-1.5 overflow-y-auto text-[12.5px]">
              {messages.map((m, i) => (
                <p
                  key={i}
                  className={
                    m.role === "user"
                      ? "text-right text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {m.text}
                </p>
              ))}
            </div>
          )}

          {turnBusy && (
            <p className="mb-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("aiChat.thinking")}
            </p>
          )}

          {notice && !turnBusy && (
            <p className="mb-3 text-[12px] text-destructive">{notice}</p>
          )}

          {showCards && (
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              {lastWithDesigns!.designs!.map((design, i) => {
                const icon = stage === "icon";
                const recipe = icon
                  ? composeIconPreview(design, brand)
                  : designRecipe(design, brand);
                return (
                  <div
                    key={i}
                    className="flex flex-col gap-2 rounded-xl border border-foreground/[0.08] bg-white p-2.5"
                  >
                    <span className="flex min-h-[72px] items-center justify-center">
                      {icon ? (
                        <MarkRenderer recipe={recipe} size={64} />
                      ) : (
                        <LogoRenderer recipe={recipe} width={140} />
                      )}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => pick(design)}
                    >
                      {t("aiChat.pick")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {showNicheStarter && (
            <button
              type="button"
              onClick={() => setInput(t(`niches.${niche}.label`))}
              className="mb-2 self-start rounded-full border px-2.5 py-1 text-[11px] font-medium"
              style={{ borderColor: swatch.soft, color: swatch.ink }}
            >
              {t(`niches.${niche}.label`)}
            </button>
          )}

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runTurn();
              }}
              placeholder={t("aiChat.placeholder")}
              disabled={turnBusy}
              className="min-w-0 flex-1 rounded-xl border border-foreground/[0.08] bg-white px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-primary"
            />
            <Button
              type="button"
              onClick={runTurn}
              disabled={turnBusy || !input.trim()}
            >
              <Send className="h-4 w-4" />
              {t("aiChat.send")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
