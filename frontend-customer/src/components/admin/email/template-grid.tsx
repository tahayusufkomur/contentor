"use client";

import { useMemo, useState } from "react";

import type { EmailTemplate } from "@/lib/email-api";
import { TemplateCard } from "./template-card";

const CATEGORIES = ["All", "Welcome", "Newsletter", "Promotional", "Transactional", "Event"];

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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = useMemo(() => {
    let result = templates;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (category !== "All") {
      result = result.filter(
        (t) => ((t as Record<string, unknown>).category as string || "").toLowerCase() === category.toLowerCase(),
      );
    }
    return result;
  }, [templates, search, category]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-64 rounded-md border px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
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
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showStartFromScratch && (
          <button
            onClick={onStartFromScratch}
            className="flex h-[260px] items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/10 transition-colors hover:border-primary/50 hover:bg-muted/30"
          >
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
