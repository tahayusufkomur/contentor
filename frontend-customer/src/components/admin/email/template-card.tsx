"use client";

import type { EmailTemplate } from "@/lib/email-api";

interface TemplateCardProps {
  template: EmailTemplate;
  previewHtml?: string;
  mode: "library" | "picker";
  loading?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPreview?: () => void;
}

export function TemplateCard({
  template,
  previewHtml,
  mode,
  loading,
  onSelect,
  onEdit,
  onDelete,
  onPreview,
}: TemplateCardProps) {
  const isGallery = (template as Record<string, unknown>).template_type === "provided";
  const category = (template as Record<string, unknown>).category as string | undefined;

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md ${
        mode === "picker" ? "cursor-pointer" : ""
      }`}
      onClick={mode === "picker" ? onSelect : undefined}
    >
      {/* Preview area */}
      <div className="relative h-[200px] overflow-hidden bg-muted/20">
        {previewHtml ? (
          <div className="h-[500px] w-[600px] origin-top-left scale-[0.38]">
            <iframe
              srcDoc={previewHtml}
              sandbox=""
              className="h-full w-full border-0"
              title={`Preview of ${template.name}`}
              style={{ pointerEvents: "none" }}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No preview available
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <p className="text-sm text-muted-foreground">Copying template...</p>
          </div>
        )}

        {/* Hover overlay — library mode */}
        {mode === "library" && !loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100"
              >
                Edit
              </button>
            )}
            {onPreview && (
              <button
                onClick={(e) => { e.stopPropagation(); onPreview(); }}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100"
              >
                Preview
              </button>
            )}
            {onDelete && !isGallery && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            )}
          </div>
        )}

        {/* Hover overlay — picker mode */}
        {mode === "picker" && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Use Template
            </span>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium">{template.name}</p>
        <div className="flex items-center gap-2">
          {category && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
              {category}
            </span>
          )}
          {isGallery && (
            <span className="text-[10px] text-muted-foreground">Gallery</span>
          )}
        </div>
      </div>
    </div>
  );
}
