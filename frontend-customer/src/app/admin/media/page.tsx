"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { BatchDropzone } from "@/components/admin/batch-dropzone";
import { PhotosView } from "@/components/admin/media/photos-view";
import { VideosView } from "@/components/admin/media/videos-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

/** The coach's photos and videos in one place, with one way to add to them. */
export default function MediaPage() {
  const t = useTranslations("admin");
  const type = useSearchParams().get("type") === "videos" ? "videos" : "photos";
  // Bumped when the uploader lands a file of that kind, so its list reloads.
  const [landed, setLanded] = useState({ photo: 0, video: 0 });

  return (
    <div className="space-y-6">
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("nav.items.media")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("media.subtitle")}</p>
      </div>

      <BatchDropzone
        onUploaded={(kind) => setLanded((n) => ({ ...n, [kind]: n[kind] + 1 }))}
      />

      {/* key remounts the tabs when ?type= changes under the same page. */}
      <Tabs defaultValue={type} key={type}>
        <TabsList>
          <TabsTrigger value="photos">{t("media.photos")}</TabsTrigger>
          <TabsTrigger value="videos">{t("media.videos")}</TabsTrigger>
        </TabsList>
        <TabsContent value="photos">
          <PhotosView refreshSignal={landed.photo} />
        </TabsContent>
        <TabsContent value="videos">
          <VideosView refreshSignal={landed.video} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
