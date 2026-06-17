"use client";

import { useState } from "react";
import { X, LayoutTemplate, Save, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "./canvas/editor-store";
import { templatesForPage } from "@/lib/blocks/page-templates";
import type { Block, PageKey, PageTemplate } from "@/types/tenant";

interface TemplateGalleryProps {
  pageKey: PageKey;
  savedTemplates: PageTemplate[];
  onSaveTemplate: (name: string, blocks: Block[]) => void;
  onDeleteTemplate: (id: string) => void;
  onClose: () => void;
}

/** Modal to start a page from a pre-built template or the coach's saved ones,
 *  and to save the current page as a reusable template. Applying replaces the
 *  current page's blocks (with a confirm step). */
export function TemplateGallery({
  pageKey,
  savedTemplates,
  onSaveTemplate,
  onDeleteTemplate,
  onClose,
}: TemplateGalleryProps) {
  const store = useEditorStore();
  const builtIns = templatesForPage(pageKey);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const apply = (template: PageTemplate) => {
    store.applyTemplate(pageKey, template.blocks);
    onClose();
  };

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveTemplate(trimmed, store.blocksFor(pageKey));
    setName("");
  };

  const TemplateCard = ({
    template,
    saved,
  }: {
    template: PageTemplate;
    saved?: boolean;
  }) => {
    const confirming = confirmingId === template.id;
    return (
      <div className="flex flex-col rounded-lg border bg-card p-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="text-sm font-medium">{template.name}</span>
          {saved && (
            <button
              type="button"
              onClick={() => onDeleteTemplate(template.id)}
              className="text-muted-foreground transition-colors hover:text-destructive"
              title="Delete template"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {template.description && (
          <p className="mb-2 text-xs text-muted-foreground">
            {template.description}
          </p>
        )}
        <p className="mb-3 text-xs text-muted-foreground">
          {template.blocks.length} blocks
        </p>
        {confirming ? (
          <div className="mt-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => apply(template)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Check className="h-3.5 w-3.5" /> Replace page
            </button>
            <button
              type="button"
              onClick={() => setConfirmingId(null)}
              className="rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingId(template.id)}
            className="mt-auto rounded-md border px-2 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5"
          >
            Use this template
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Templates</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Start from a template
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {builtIns.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No templates for this page yet.
                </p>
              ) : (
                builtIns.map((t) => <TemplateCard key={t.id} template={t} />)
              )}
            </div>
          </section>

          {savedTemplates.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your templates
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {savedTemplates.map((t) => (
                  <TemplateCard key={t.id} template={t} saved />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="border-t p-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Save this page as a template
          </p>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
              placeholder="Template name"
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={saveCurrent}
              disabled={!name.trim()}
              className={cn(
                "flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                !name.trim() && "cursor-not-allowed opacity-50",
              )}
            >
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
