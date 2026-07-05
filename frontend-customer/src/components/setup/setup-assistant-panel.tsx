"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Copy, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { ModalPortal } from "@/components/ui/modal-portal";
import { EraseDemoDialog } from "@/components/setup/erase-demo-dialog";
import { SETUP_CATALOG, SETUP_GROUP_ORDER } from "@/components/setup/catalog";
import {
  patchSetup,
  useDemoContent,
  useSetupStatus,
  type SetupItem,
} from "@/lib/setup-assistant";

export function SetupAssistantPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("admin");
  const status = useSetupStatus();
  const demo = useDemoContent();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [eraseOpen, setEraseOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open || !status) return null;

  const { items, progress } = status;
  const allDone = progress.done === progress.total;
  const groups = SETUP_GROUP_ORDER.map((group) => ({
    group,
    rows: items.filter((item) => item.group === group),
  })).filter(({ rows }) => rows.length > 0);

  const copySiteLink = () => {
    void navigator.clipboard.writeText(window.location.origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    void patchSetup({ item: "share_site", done: true });
  };

  const renderRow = (item: SetupItem) => {
    const entry = SETUP_CATALOG[item.key];
    if (!entry) return null;
    const Icon = entry.icon;
    const title = t(`setup.items.${item.key}.title`);
    const description = t(`setup.items.${item.key}.description`);
    const checkCircle = (
      <button
        type="button"
        aria-label={item.done ? t("setup.markUndone") : t("setup.markDone")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Manual toggle; unticking only clears a manual tick — auto wins.
          void patchSetup({ item: item.key, done: !item.done });
        }}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
          item.done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 bg-background text-muted-foreground hover:border-primary"
        }`}
      >
        {item.done ? (
          <Check className="h-4 w-4" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
      </button>
    );
    const body = (
      <>
        {checkCircle}
        <span className="min-w-0 flex-1 text-left">
          <span
            className={`block text-sm font-medium ${item.done ? "text-muted-foreground line-through" : ""}`}
          >
            {title}
            {item.key === "demo_cleanup" && demo?.present ? (
              <span className="ml-1 text-xs text-muted-foreground">
                ({demo.counts.courses + demo.counts.videos + demo.counts.photos}
                +)
              </span>
            ) : null}
          </span>
          {!item.done && (
            <span className="block truncate text-xs text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        {!item.done && (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </>
    );
    const rowClass = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50 ${
      item.done ? "opacity-70" : ""
    }`;
    if (entry.action === "erase") {
      return (
        <button
          type="button"
          onClick={() => setEraseOpen(true)}
          className={rowClass}
        >
          {body}
        </button>
      );
    }
    if (entry.action === "copy-link") {
      return (
        <button type="button" onClick={copySiteLink} className={rowClass}>
          {body}
        </button>
      );
    }
    return (
      <Link
        href={entry.href ?? "/admin"}
        onClick={onClose}
        className={rowClass}
      >
        {body}
      </Link>
    );
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label={t("setup.dismiss")}
          onClick={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-background shadow-xl">
          <div className="border-b p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {allDone ? t("setup.celebrateTitle") : t("setup.title")}
              </h2>
              <button
                type="button"
                aria-label={t("setup.dismiss")}
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {allDone ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("setup.celebrateBody")}
                </p>
                <button
                  type="button"
                  onClick={copySiteLink}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? t("setup.copied") : t("setup.copyLink")}
                </button>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  {t("setup.progressLabel", {
                    done: progress.done,
                    total: progress.total,
                  })}
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {groups.map(({ group, rows }) => (
              <div key={group} className="mb-2">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [group]: !c[group] }))
                  }
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {t(`setup.groups.${group}`)}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${collapsed[group] ? "-rotate-90" : ""}`}
                  />
                </button>
                {!collapsed[group] && (
                  <ul className="space-y-0.5">
                    {rows.map((item) => (
                      <li key={item.key}>{renderRow(item)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="border-t p-3 text-center">
            <button
              type="button"
              onClick={() => {
                void patchSetup({ dismissed: true });
                onClose();
              }}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("setup.dismiss")}
            </button>
          </div>

          <EraseDemoDialog
            open={eraseOpen}
            onClose={() => setEraseOpen(false)}
          />
        </aside>
      </div>
    </ModalPortal>
  );
}
