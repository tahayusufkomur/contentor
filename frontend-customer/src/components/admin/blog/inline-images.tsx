"use client";

// Manages BlogPost.image_placements: each entry anchors one image under one
// H2 heading; the public page injects them at serve time (placements.py).

import { useState } from "react";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ImageLibraryDialog,
  type PickedPhoto,
} from "@/components/admin/blog/image-library-dialog";
import { Button } from "@/components/ui/button";
import { type BlogPostAdmin, updatePost } from "@/lib/blog-api";
import { parseH2Headings } from "@/lib/html-headings";

export function InlineImages({
  post,
  onPatched,
}: {
  post: BlogPostAdmin;
  onPatched: (fields: Partial<BlogPostAdmin>) => void;
}) {
  const t = useTranslations("admin");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [heading, setHeading] = useState<string | null>(null);
  const headings = parseH2Headings(post.body_html);

  const persist = async (
    placements: { heading: string; photo_id: string }[],
  ) => {
    const updated = await updatePost(post.id, {
      image_placements: placements,
    } as Partial<BlogPostAdmin>);
    onPatched(updated);
  };

  const add = (photo: PickedPhoto) => {
    if (!heading) return;
    void persist([
      ...(post.image_placements ?? []),
      { heading, photo_id: photo.id },
    ]);
    setHeading(null);
  };

  const remove = (index: number) =>
    void persist((post.image_placements ?? []).filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("blog.inlineImages")}
      </p>
      <ul className="space-y-1.5">
        {(post.image_placements_resolved ?? []).map((item, index) => (
          <li
            key={`${item.photo_id}-${index}`}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.alt}
              className="h-8 w-12 rounded object-cover"
            />
            <span className="truncate text-sm">{item.heading}</span>
            <button
              type="button"
              aria-label={t("blog.coverRemove")}
              onClick={() => remove(index)}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {headings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("blog.inlineNoHeadings")}
        </p>
      ) : heading === null ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setHeading(headings[0])}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("blog.inlineAdd")}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">
            {t("blog.inlineHeadingPrompt")}
          </label>
          <select
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            {headings.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            {t("blog.inlineAdd")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHeading(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <ImageLibraryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultKind="stock"
        onSelect={add}
      />
    </div>
  );
}
