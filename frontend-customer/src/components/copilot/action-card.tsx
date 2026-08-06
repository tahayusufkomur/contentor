"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { executeCopilotAction, undoCopilotAction } from "@/lib/copilot/api";
import { isCreateKind, isUndoableKind, runBundle } from "@/lib/copilot/state";
import { announceSiteUpdated } from "@/lib/site-events";
import { ApiError } from "@/types/api";
import type {
  ActionCard as ActionCardData,
  ExecuteResult,
} from "@/lib/copilot/types";

/** Registry of proposed cards' raw (throwing) confirm functions for a single
 * assistant turn, keyed by a per-mount token — lets `ApplyAllBar` run every
 * card's own confirm (same audit trail, same result/state updates) without
 * the cards knowing about each other. `notify` is called on every
 * register/unregister so `ApplyAllBar` can re-render reactively (e.g. to
 * hide itself once fewer than 2 proposed cards remain) instead of reading a
 * ref that never triggers React updates. */
interface BundleRegistry {
  cards: Map<string, () => Promise<void>>;
  notify: () => void;
}
const CardBundleContext = createContext<BundleRegistry | null>(null);

export function CardBundleProvider({ children }: { children: ReactNode }) {
  const cards = useRef<Map<string, () => Promise<void>>>(new Map());
  const [, setVersion] = useState(0);
  const registry = useRef<BundleRegistry>({
    cards: cards.current,
    notify: () => setVersion((v) => v + 1),
  });
  return (
    <CardBundleContext.Provider value={registry.current}>
      {children}
    </CardBundleContext.Provider>
  );
}

/** Preview image for photo/logo cards. Curated picks arrive flagged
 * `reveal`: the card holds a shimmering "Creating your photo…" state for a
 * beat, then blur-reveals the image. The pick itself is instant — the pause
 * is presentation. The coach's own attached photos never get this (their
 * photo appearing out of a "generating" state would read as nonsense). */
function CardPhoto({ card }: { card: ActionCardData }) {
  const t = useTranslations("student.copilot");
  const [held, setHeld] = useState(Boolean(card.reveal));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => setHeld(false), 2400);
    return () => clearTimeout(timer);
  }, [held]);
  if (!card.reveal) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={card.image_url}
        alt={card.title}
        className="mt-2 h-28 w-full rounded-md border object-cover"
      />
    );
  }
  const showing = !held && loaded;
  return (
    <div className="relative mt-2 h-28 w-full overflow-hidden rounded-md border">
      {!showing && (
        <div className="absolute inset-0 z-10">
          <Skeleton className="absolute inset-0 rounded-none" />
          <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden />
            {t("creatingPhoto")}
          </span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image_url}
        alt={card.title}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-[filter,opacity] duration-700 motion-reduce:transition-none ${
          showing ? "opacity-100 blur-0" : "opacity-0 blur-lg"
        }`}
      />
    </div>
  );
}

const PAGE_NAME_KEYS = new Set([
  "home",
  "about",
  "courses",
  "pricing",
  "faq",
  "contact",
]);
const FIELD_NAME_KEYS = new Set([
  "heading",
  "subheading",
  "body",
  "ctaText",
  "buttonText",
  "intro",
  "items",
  "ctaHref",
  "buttonHref",
  "secondaryButtonText",
  "secondaryButtonHref",
  "layout",
  "headingLevel",
  "imagePosition",
  "overlay",
  "overlayStrength",
  "text",
  "linkText",
  "linkHref",
  "submitLabel",
  "successMessage",
]);

export function ActionCard({ card }: { card: ActionCardData }) {
  const t = useTranslations("student.copilot");
  const router = useRouter();
  const bundle = useContext(CardBundleContext);
  const token = useId();
  const [state, setState] = useState<"proposed" | "done" | "dismissed">(
    "proposed",
  );
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [auditId, setAuditId] = useState<number | null>(null);

  // Raw body — THROWS on failure (no swallowing wrapper). This is what gets
  // registered into the bundle: runBundle's stop-on-failure semantics only
  // work if the confirm it awaits actually rejects. `useAsyncAction`'s `run`
  // swallows every error (it only ever calls onError, never re-throws), so
  // wiring that into the bundle would make failures invisible to runBundle —
  // see the seam test in lib/__tests__/copilot.test.ts.
  const confirmRaw = async () => {
    const res = await executeCopilotAction(card.token);
    setResult(res.result);
    setAuditId(res.audit_id);
    setState("done");
    // Coaches see the live editor canvas, which renders from the editor
    // store, not server props — announce so it re-syncs in place.
    announceSiteUpdated();
    router.refresh();
    toast.success(t(isCreateKind(card.kind) ? "created" : "applied"));
  };

  // Solo button path keeps the useAsyncAction wrapper for its own loading
  // state + per-card error toast. When confirmRaw runs via the bundle
  // instead, this wrapper (and its toast) is bypassed entirely — ApplyAllBar
  // reports the partial-failure toast for that path.
  const { run: confirm, loading } = useAsyncAction(confirmRaw, {
    errorToast: t("error"),
  });

  const { run: undo, loading: undoing } = useAsyncAction(
    async () => {
      if (auditId == null) return;
      await undoCopilotAction(auditId);
      announceSiteUpdated();
      router.refresh();
      toast.success(t("undone"));
      setState("dismissed");
    },
    {
      // A 400 means the stale/not-undoable class (server already refused
      // it as a deliberate outcome, e.g. "not the latest change" or "photo
      // gone") — that's the only case undoStale's copy actually describes.
      // Anything else (network error, 500, etc.) gets the generic message.
      onError: (err) => {
        toast.error(
          err instanceof ApiError && err.status === 400
            ? t("undoStale")
            : t("error"),
        );
      },
    },
  );

  useEffect(() => {
    if (!bundle) return;
    if (state === "proposed") {
      bundle.cards.set(token, confirmRaw);
    } else {
      bundle.cards.delete(token);
    }
    bundle.notify();
    return () => {
      bundle.cards.delete(token);
      bundle.notify();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, token, state]);

  if (state === "dismissed") return null;
  return (
    <div
      className="mt-2 rounded-lg border bg-background p-3 text-sm"
      data-copilot-ui
    >
      <p className="font-medium">{card.title}</p>
      {card.image_url && <CardPhoto card={card} />}
      {card.detail && (
        <p className="mt-1 text-muted-foreground">{card.detail}</p>
      )}
      {card.changes && card.changes.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
          {card.changes.map((c, i) => (
            <li key={i}>
              <p className="text-xs font-medium text-muted-foreground">
                {PAGE_NAME_KEYS.has(c.page) ? t(`pageNames.${c.page}`) : c.page}{" "}
                ›{" "}
                {FIELD_NAME_KEYS.has(c.field)
                  ? t(`fieldNames.${c.field}`)
                  : c.field}
              </p>
              {c.old !== null && c.new !== null ? (
                <>
                  <p className="line-clamp-2 text-muted-foreground line-through decoration-muted-foreground/40">
                    {c.old}
                  </p>
                  <p className="line-clamp-3">{c.new}</p>
                </>
              ) : (
                <p className="text-muted-foreground">{t("updated")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {state === "done" ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="text-xs font-medium text-primary">
            {t(isCreateKind(card.kind) ? "createdShort" : "appliedShort")}
            {result?.url ? (
              <NavLink href={result.url} className="ml-2 underline">
                {t("view")}
              </NavLink>
            ) : null}
          </p>
          {auditId != null && isUndoableKind(card.kind) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={undo}
              loading={undoing}
              loadingText={t("undoing")}
            >
              {t("undo")}
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="brand"
            onClick={confirm}
            loading={loading}
            loadingText={t("applying")}
          >
            {t("confirm")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState("dismissed")}
          >
            {t("dismiss")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Applies every still-proposed card in the current bundle sequentially,
 * via each card's raw (throwing) confirm — see the seam comment above
 * `confirmRaw`. A card that fails stays in "proposed" state (its own
 * confirmRaw never reached the `setState("done")` line), so the coach can
 * retry it individually; this bar reports the aggregate outcome as a single
 * toast, since no per-card toast fires on the bundle path. */
export function ApplyAllBar() {
  const t = useTranslations("student.copilot");
  const bundle = useContext(CardBundleContext);
  // Re-render whenever a card (un)registers, so the bar unmounts as soon as
  // fewer than 2 proposed cards remain instead of staying clickable after
  // the bundle it once represented has resolved down to 0-1 cards.
  const proposedCount = bundle?.cards.size ?? 0;
  const { run, loading } = useAsyncAction(async () => {
    const confirms = bundle ? [...bundle.cards.values()] : [];
    if (confirms.length < 2) return;
    const { done, failed } = await runBundle(confirms);
    if (failed) {
      toast.error(t("appliedPartial", { done, total: confirms.length }));
    } else {
      toast.success(t("appliedAll", { count: done }));
    }
  });
  if (proposedCount < 2) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={run}
      loading={loading}
      loadingText={t("applying")}
    >
      {t("applyAll")}
    </Button>
  );
}
