"use client";

import { useMemo, useState } from "react";
import { ImageIcon, Search, Sparkles, X } from "lucide-react";

import { ModalPortal } from "@/components/ui/modal-portal";
import type { CatalogEntry, CatalogSlot } from "@/lib/email-api";

/** Pick something of hers to feature in an email: one of her offers or pages,
 *  or a live slot ("Your next class or event") that shows whatever is next
 *  when the email goes out. */
export function ItemPickerModal({
  items,
  slots,
  onPick,
  onClose,
}: {
  items: CatalogEntry[];
  slots: CatalogSlot[];
  onPick: (item: CatalogEntry | CatalogSlot) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      q
        ? items.filter((i) =>
            `${i.title} ${i.kindLabel}`.toLowerCase().includes(q),
          )
        : items,
    [items, q],
  );

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-label="Feature something of yours"
          className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">
              Feature something of yours
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your courses, sessions and pages…"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-3">
            {!q && slots.length > 0 && (
              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Always up to date
                </h3>
                <ul className="space-y-1">
                  {slots.map((slot) => (
                    <Row
                      key={slot.ref}
                      item={slot}
                      label={slot.slotLabel}
                      sub={`Today: ${slot.title}`}
                      onPick={onPick}
                    />
                  ))}
                </ul>
              </section>
            )}
            <section>
              {!q && slots.length > 0 && (
                <h3 className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">
                  Your offers and pages
                </h3>
              )}
              {shown.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  {q
                    ? "Nothing matches."
                    : "Nothing published yet. Your courses, sessions and articles show here once they are live."}
                </p>
              ) : (
                <ul className="space-y-1">
                  {shown.map((item) => (
                    <Row
                      key={item.ref}
                      item={item}
                      label={item.title}
                      sub={[item.kindLabel, item.meta]
                        .filter(Boolean)
                        .join(" · ")}
                      onPick={onPick}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function Row<T extends CatalogEntry>({
  item,
  label,
  sub,
  onPick,
}: {
  item: T;
  label: string;
  sub: string;
  onPick: (item: T) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
      >
        <span className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {sub}
          </span>
        </span>
      </button>
    </li>
  );
}
