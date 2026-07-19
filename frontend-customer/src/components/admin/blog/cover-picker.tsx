"use client";

import { useState } from "react";

import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ImageLibraryDialog,
  type PickedPhoto,
} from "@/components/admin/blog/image-library-dialog";
import { Button } from "@/components/ui/button";
import { type BlogPostAdmin, updatePost } from "@/lib/blog-api";

export function CoverPicker({
  post,
  onPatched,
}: {
  post: BlogPostAdmin;
  onPatched: (fields: Partial<BlogPostAdmin>) => void;
}) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);

  const setCover = async (photo: PickedPhoto | null) => {
    const updated = await updatePost(post.id, {
      cover_photo: photo ? photo.id : null,
    } as Partial<BlogPostAdmin>);
    onPatched(updated);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("blog.coverLabel")}
      </p>
      {post.cover_photo_url ? (
        <div className="relative overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.cover_photo_url}
            alt=""
            className="aspect-[3/1] w-full object-cover"
          />
          <div className="absolute bottom-2 right-2 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              {t("blog.coverChange")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCover(null)}
            >
              {t("blog.coverRemove")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-sm text-muted-foreground hover:text-foreground"
        >
          <ImageIcon className="h-4 w-4" />
          {t("blog.coverChoose")}
        </button>
      )}
      <ImageLibraryDialog
        open={open}
        onOpenChange={setOpen}
        defaultKind="hero"
        onSelect={(photo) => void setCover(photo)}
      />
    </div>
  );
}
