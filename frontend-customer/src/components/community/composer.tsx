"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createPost, uploadCommunityImage } from "@/lib/community";
import type { CommunityPost } from "@/types/community";
import { ApiError } from "@/types/api";

const MAX_IMAGES = 4;

export function Composer({
  onPosted,
}: {
  onPosted: (post: CommunityPost) => void;
}) {
  const [body, setBody] = useState("");
  const [images, setImages] = useState<{ key: string; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList) => {
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) toast.info(`Up to ${MAX_IMAGES} photos per post.`);
    setBusy(true);
    try {
      for (const file of picked) {
        const key = await uploadCommunityImage(file);
        setImages((prev) => [
          ...prev,
          { key, preview: URL.createObjectURL(file) },
        ]);
      }
    } catch {
      toast.error("Photo upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const post = await createPost({
        body: body.trim(),
        image_keys: images.map((i) => i.key),
      });
      setBody("");
      setImages([]);
      if (post.status === "pending") {
        toast.info("Your post is waiting for a moderator's approval.");
      }
      onPosted(post);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error("You're posting too fast — try again in a bit.");
      } else if (err instanceof ApiError && err.status === 403) {
        toast.error("You can't post right now.");
      } else {
        toast.error("Couldn't publish your post.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Textarea
          placeholder="Share something with the community…"
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
                  aria-label="Remove photo"
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
            <ImagePlus className="mr-1.5 h-4 w-4" /> Photo
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
          <Button onClick={submit} disabled={busy || !body.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Post
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
