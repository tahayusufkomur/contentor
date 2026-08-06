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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { executeCopilotAction, undoCopilotAction } from "@/lib/copilot/api";
import { isCreateKind, isUndoableKind, runBundle } from "@/lib/copilot/state";
import { announceSiteUpdated } from "@/lib/site-events";
import type {
  ActionCard as ActionCardData,
  ExecuteResult,
} from "@/lib/copilot/types";

/** Registry of proposed cards' confirm functions for a single assistant
 * turn, keyed by a per-mount token — lets `ApplyAllBar` run every card's
 * own confirm (same audit trail, same success/error toast) without the
 * cards knowing about each other. */
type BundleRegistry = React.MutableRefObject<Map<string, () => Promise<void>>>;
const CardBundleContext = createContext<BundleRegistry | null>(null);

export function CardBundleProvider({ children }: { children: ReactNode }) {
  const registry = useRef<Map<string, () => Promise<void>>>(new Map());
  return (
    <CardBundleContext.Provider value={registry}>
      {children}
    </CardBundleContext.Provider>
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

  const { run: confirm, loading } = useAsyncAction(
    async () => {
      const res = await executeCopilotAction(card.token);
      setResult(res.result);
      setAuditId(res.audit_id);
      setState("done");
      // Coaches see the live editor canvas, which renders from the editor
      // store, not server props — announce so it re-syncs in place.
      announceSiteUpdated();
      router.refresh();
      toast.success(t(isCreateKind(card.kind) ? "created" : "applied"));
    },
    { errorToast: t("error") },
  );

  const { run: undo, loading: undoing } = useAsyncAction(
    async () => {
      if (auditId == null) return;
      await undoCopilotAction(auditId);
      announceSiteUpdated();
      router.refresh();
      toast.success(t("undone"));
      setState("dismissed");
    },
    { errorToast: t("undoStale") },
  );

  useEffect(() => {
    if (!bundle) return;
    if (state === "proposed") {
      bundle.current.set(token, confirm);
    } else {
      bundle.current.delete(token);
    }
    return () => {
      bundle.current.delete(token);
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
      {card.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image_url}
          alt={card.title}
          className="mt-2 h-28 w-full rounded-md border object-cover"
        />
      )}
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

/** Applies every still-proposed card in the current bundle sequentially.
 * Each card's own `confirm` already flips its state to "done" and fires its
 * own error toast on failure — this bar only reports the aggregate success
 * count and stops the run at the first failure. */
export function ApplyAllBar() {
  const t = useTranslations("student.copilot");
  const bundle = useContext(CardBundleContext);
  const { run, loading } = useAsyncAction(async () => {
    const confirms = bundle ? [...bundle.current.values()] : [];
    if (confirms.length < 2) return;
    const { done, failed } = await runBundle(confirms);
    if (!failed) toast.success(t("appliedAll", { count: done }));
  });
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
