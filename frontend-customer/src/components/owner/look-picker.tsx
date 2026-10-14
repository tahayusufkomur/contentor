"use client";

import { useEffect, useState } from "react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ModalPortal } from "@/components/ui/modal-portal";
import { PageState } from "@/components/ui/page-state";
import { SkeletonCardGrid } from "@/components/ui/skeletons";
import { LookCardsView } from "@/components/setup-flow/look-cards";
import { SHELL_CSS, SHELL_TOKENS } from "@/components/setup-flow/tokens";
import { clientFetch } from "@/lib/api-client";
import type { LookCards } from "@/lib/setup-flow";
import { siteLook } from "@/lib/site-styles";
import type { TenantConfig } from "@/types/tenant";

type SiteLookCards = LookCards & {
  current: { style: string; palette: string };
};

const lookValue = (style?: string, palette?: string) =>
  palette ? `${style}:${palette}` : (style ?? "");

/** The site's look in the editor's Brand section — its layouts, colours and
 *  fonts as one — and "Change look": the setup interview's look cards (same
 *  ranking, colourways and whole-page preview) over the site. */
export function LookPicker({
  config,
  onApply,
}: {
  config: TenantConfig;
  /** Wears ``look`` ("journal" or "journal:sage"): every page restyles. */
  onApply: (look: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const look = siteLook(config.style);
  const colourway =
    look.palettes?.find((p) => p.id === config.palette)?.label ??
    look.paletteLabel ??
    "Original";

  return (
    <div className="space-y-2">
      <div>
        <Label>Look</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Layouts, colours and fonts for every page.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/70 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{look.label}</p>
          <p className="truncate text-xs text-muted-foreground">{colourway}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Change look
        </Button>
      </div>
      {open && (
        <LookDialog
          current={lookValue(config.style, config.palette)}
          brandName={config.brand_name}
          onApply={onApply}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function LookDialog({
  current,
  brandName,
  onApply,
  onClose,
}: {
  current: string;
  brandName: string;
  onApply: (look: string) => Promise<void>;
  onClose: () => void;
}) {
  const [cards, setCards] = useState<SiteLookCards | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [chosen, setChosen] = useState(current);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    clientFetch<SiteLookCards>("/api/v1/admin/config/look/")
      .then((body) => !cancelled && setCards(body))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const { run: wear, loading } = useAsyncAction(
    async (look: string) => {
      if (look !== current) await onApply(look);
      onClose();
    },
    { errorToast: "Couldn’t change the look. Try again." },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <ModalPortal>
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
      <div
        role="dialog"
        aria-modal
        aria-label="Change your look"
        style={SHELL_TOKENS}
        className="sf-shell fixed inset-0 z-[60] flex flex-col bg-[var(--sf-paper)] text-[var(--sf-ink)]"
      >
        <header className="flex flex-col gap-3 border-b border-[var(--sf-line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Change your look</h2>
            <p className="text-[13px] text-[var(--sf-graphite)]">
              Every page takes the look you pick and keeps its words and photos.
              Tap a look to see it as a page.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={() => wear(chosen)}
              loading={loading}
              loadingText="Changing…"
              disabled={chosen === current}
            >
              Use this look
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-12 sm:px-8">
          <PageState
            loading={!cards && !error}
            error={error}
            onRetry={() => setReload((n) => n + 1)}
            skeleton={<SkeletonCardGrid count={6} className="mt-8" />}
          >
            {cards && (
              <LookCardsView
                cards={cards}
                brandName={brandName}
                host={window.location.host}
                chosen={chosen}
                disabled={loading}
                onPick={(value) => setChosen(value)}
                onMore={async () => cards}
                onKeep={() => wear(chosen)}
              />
            )}
          </PageState>
        </div>
      </div>
    </ModalPortal>
  );
}
