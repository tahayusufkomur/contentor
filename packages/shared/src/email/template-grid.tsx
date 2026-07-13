"use client";

import { useCallback, useMemo, useState } from "react";

import type { EmailTemplate } from "@/lib/email-api";
import { TemplateCard } from "./template-card";

const CATEGORIES = [
  "All",
  "Welcome",
  "Newsletter",
  "Promotional",
  "Transactional",
  "Event",
];
const SOURCES = ["All", "Saved", "Gallery"] as const;
type Source = (typeof SOURCES)[number];

const SIZES = ["small", "medium", "large"] as const;
type GridSize = (typeof SIZES)[number];

const SIZE_CONFIG: Record<
  GridSize,
  { cols: string; aspectRatio: string; scratchHeight: string }
> = {
  small: {
    cols: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
    aspectRatio: "75%",
    scratchHeight: "h-[180px]",
  },
  medium: {
    cols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    aspectRatio: "100%",
    scratchHeight: "h-[260px]",
  },
  large: {
    cols: "grid-cols-1 sm:grid-cols-1 lg:grid-cols-2",
    aspectRatio: "130%",
    scratchHeight: "h-[360px]",
  },
};

interface TemplateGridProps {
  templates: EmailTemplate[];
  previewHtmlMap: Record<string, string>;
  mode: "library" | "picker";
  loadingTemplateId?: string | null;
  onSelect?: (template: EmailTemplate) => void;
  onEdit?: (template: EmailTemplate) => void;
  onDelete?: (template: EmailTemplate) => void;
  onPreview?: (template: EmailTemplate) => void;
  showStartFromScratch?: boolean;
  onStartFromScratch?: () => void;
}

export function TemplateGrid({
  templates,
  previewHtmlMap,
  mode,
  loadingTemplateId,
  onSelect,
  onEdit,
  onDelete,
  onPreview,
  showStartFromScratch,
  onStartFromScratch,
}: TemplateGridProps) {
  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") || "";
  });
  const [category, setCategory] = useState(() => {
    if (typeof window === "undefined") return "All";
    return new URLSearchParams(window.location.search).get("category") || "All";
  });
  const [source, setSource] = useState<Source>(() => {
    if (typeof window === "undefined") return "All";
    const v = new URLSearchParams(window.location.search).get("source");
    return SOURCES.includes(v as Source) ? (v as Source) : "All";
  });
  const [gridSize, setGridSize] = useState<GridSize>(() => {
    if (typeof window === "undefined") return "medium";
    const v = new URLSearchParams(window.location.search).get("size");
    return SIZES.includes(v as GridSize) ? (v as GridSize) : "medium";
  });

  const syncParam = useCallback(
    (key: string, value: string, defaultValue: string) => {
      const params = new URLSearchParams(window.location.search);
      if (value && value !== defaultValue) params.set(key, value);
      else params.delete(key);
      const qs = params.toString();
      const next = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      window.history.replaceState({}, "", next);
    },
    [],
  );

  const updateSearch = useCallback(
    (v: string) => {
      setSearch(v);
      syncParam("q", v, "");
    },
    [syncParam],
  );
  const updateCategory = useCallback(
    (v: string) => {
      setCategory(v);
      syncParam("category", v, "All");
    },
    [syncParam],
  );
  const updateSource = useCallback(
    (v: Source) => {
      setSource(v);
      syncParam("source", v, "All");
    },
    [syncParam],
  );
  const updateGridSize = useCallback(
    (v: GridSize) => {
      setGridSize(v);
      syncParam("size", v, "medium");
    },
    [syncParam],
  );

  const hasSavedTemplates = useMemo(
    () =>
      templates.some(
        (t) => (t as Record<string, unknown>).template_type === "user",
      ),
    [templates],
  );

  const filtered = useMemo(() => {
    let result = templates;
    if (source === "Saved") {
      result = result.filter(
        (t) => (t as Record<string, unknown>).template_type === "user",
      );
    } else if (source === "Gallery") {
      result = result.filter(
        (t) => (t as Record<string, unknown>).template_type !== "user",
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (category !== "All") {
      result = result.filter(
        (t) =>
          (
            ((t as Record<string, unknown>).category as string) || ""
          ).toLowerCase() === category.toLowerCase(),
      );
    }
    return result;
  }, [templates, search, category, source]);

  return (
    <div className="space-y-4">
      {/* Source toggle */}
      {hasSavedTemplates && (
        <div className="flex gap-2">
          {SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => updateSource(s)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                source === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s === "Saved" ? "My Saved" : s}
            </button>
          ))}
        </div>
      )}

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-64 rounded-md border px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => updateCategory(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-0 rounded-md border border-input bg-muted/50 p-0.5">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => updateGridSize(s)}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                gridSize === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className={`grid gap-4 ${SIZE_CONFIG[gridSize].cols}`}>
        {showStartFromScratch && (
          <button
            onClick={onStartFromScratch}
            className={`flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/10 transition-colors hover:border-primary/50 hover:bg-muted/30 ${SIZE_CONFIG[gridSize].scratchHeight}`}
          >
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <svg
                  className="h-6 w-6 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium">Start from Scratch</p>
            </div>
          </button>
        )}
        {filtered.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            previewHtml={previewHtmlMap[template.id]}
            mode={mode}
            loading={loadingTemplateId === template.id}
            previewAspectRatio={SIZE_CONFIG[gridSize].aspectRatio}
            onSelect={onSelect ? () => onSelect(template) : undefined}
            onEdit={onEdit ? () => onEdit(template) : undefined}
            onDelete={onDelete ? () => onDelete(template) : undefined}
            onPreview={onPreview ? () => onPreview(template) : undefined}
          />
        ))}
      </div>

      {filtered.length === 0 && !showStartFromScratch && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No templates found.
        </p>
      )}
    </div>
  );
}
