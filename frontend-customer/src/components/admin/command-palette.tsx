"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { Search, ArrowRight, Sparkles } from "lucide-react";

import { filterPalette, type PaletteEntry } from "@/lib/admin-palette";

export function CommandPalette({
  open,
  onOpenChange,
  entries,
  onAskAssistant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: PaletteEntry[];
  /** Her words go to the assistant when they name no page (or she picks
   *  the ask row). */
  onAskAssistant: (text: string) => void;
}) {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(
    () => filterPalette(entries, query),
    [entries, query],
  );

  // Whatever she typed can also be asked: one more row under the pages.
  const question = query.trim();
  const rowCount = filteredItems.length + (question ? 1 : 0);

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view when navigating via keyboard
  useEffect(() => {
    if (open && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [selectedIndex, open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, rowCount));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? Math.max(0, rowCount - 1) : prev - 1,
        );
      } else if (e.key === "Enter" && !filteredItems[selectedIndex]) {
        e.preventDefault();
        if (!question) return;
        onOpenChange(false);
        onAskAssistant(question);
      } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        onOpenChange(false);
        if (selected.newTab) {
          window.open(selected.href, "_blank", "noopener,noreferrer");
        } else {
          navigate(selected.href);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    filteredItems,
    selectedIndex,
    navigate,
    onOpenChange,
    onAskAssistant,
    question,
    rowCount,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 md:pt-24 bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl rounded-2xl border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b px-4 py-3 gap-3 bg-muted">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs text-muted-foreground font-mono">
            ESC
          </kbd>
        </div>

        {/* Command Items List */}
        <div className="overflow-y-auto p-2 divide-y divide-border">
          {filteredItems.length === 0 && (
            <p className="px-4 pb-2 pt-4 text-center text-sm text-muted-foreground">
              {t("palette.empty")}
            </p>
          )}
          {filteredItems.map((item, idx) => {
            const Icon = item.icon;
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  if (item.newTab) {
                    window.open(item.href, "_blank", "noopener,noreferrer");
                  } else {
                    navigate(item.href);
                  }
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-1.5 rounded-md ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                  </div>
                  <div className="truncate">
                    <div className="font-medium leading-tight truncate">
                      {item.label}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span
                    className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.group}
                  </span>
                  <ArrowRight
                    className={`h-4 w-4 transition-transform ${
                      isSelected ? "translate-x-0.5" : "opacity-0"
                    }`}
                  />
                </div>
              </button>
            );
          })}
          {question && (
            <button
              ref={(el) => {
                itemRefs.current[filteredItems.length] = el;
              }}
              type="button"
              onClick={() => {
                onOpenChange(false);
                onAskAssistant(question);
              }}
              onMouseEnter={() => setSelectedIndex(filteredItems.length)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                selectedIndex === filteredItems.length
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">
                {t("palette.askAssistant", { query: question })}
              </span>
            </button>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t px-4 py-2 bg-muted text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono rounded border px-1 bg-muted">↑</kbd>{" "}
              <kbd className="font-mono rounded border px-1 bg-muted">↓</kbd>{" "}
              {t("palette.navigate")}
            </span>
            <span>
              <kbd className="font-mono rounded border px-1 bg-muted">↵</kbd>{" "}
              {t("palette.select")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
