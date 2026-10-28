"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { createPost, uploadCommunityImage } from "@/lib/community";
import type { CommunityPost } from "@/types/community";
import { ApiError } from "@/types/api";
import { useAsyncAction } from "@shared/hooks/use-async-action";

const MAX_IMAGES = 4;

export function Composer({
  onPosted,
}: {
  onPosted: (post: CommunityPost) => void;
}) {
  const t = useTranslations("common");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<{ key: string; preview: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { run: addFiles, loading: uploading } = useAsyncAction(
    async (files: FileList) => {
      const room = MAX_IMAGES - images.length;
      const picked = Array.from(files).slice(0, room);
      if (files.length > room) {
        toast.info(t("community.maxPhotos", { count: MAX_IMAGES }));
      }
      for (const file of picked) {
        const key = await uploadCommunityImage(file);
        setImages((prev) => [
          ...prev,
          { key, preview: URL.createObjectURL(file) },
        ]);
      }
    },
    { errorToast: t("community.photoError") },
  );

  const { run: submit, loading: posting } = useAsyncAction(
    async () => {
      const post = await createPost({
        body: body.trim(),
        image_keys: images.map((i) => i.key),
      });
      setBody("");
      setImages([]);
      if (post.status === "pending") {
        toast.info(t("community.pendingApproval"));
      }
      onPosted(post);
    },
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 429) {
          toast.error(t("community.tooFast"));
        } else if (err instanceof ApiError && err.status === 403) {
          toast.error(t("community.cantPost"));
        } else {
          toast.error(t("community.publishError"));
        }
      },
    },
  );

  const busy = uploading || posting;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Textarea
          placeholder={t("community.sharePlaceholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={10000}
          rows={3}
        />
        {images.length > 0 && (
          <div className="flex gap-2">
            {images.map((img) => (
              <div key={img.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.preview}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover"
                />
                <button
                  type="button"
                  aria-label={t("community.removePhoto")}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-background shadow"
                  onClick={() =>
                    setImages((prev) => prev.filter((i) => i.key !== img.key))
                  }
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || images.length >= MAX_IMAGES}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="mr-1.5 h-4 w-4" /> {t("community.photo")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            onClick={submit}
            loading={posting}
            loadingText={t("community.posting")}
            disabled={busy || !body.trim()}
          >
            {t("community.post")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
