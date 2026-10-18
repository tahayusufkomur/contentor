"use client";

// The Photos drawer: her own photos, Contentor's library, and a new photo made from a description. The
// editor keeps it open while a photo is on its way, so a new photo is not lost by looking at another tool.

import { useTranslations } from "next-intl";
import {
  PhotoSources,
  type PhotoSourcesProps,
} from "@/components/studio/photo-sources";
import { Section } from "@/components/studio/simple-controls";

export function PhotosDrawer(props: PhotoSourcesProps) {
  const t = useTranslations("admin.studio.controls");
  return (
    <Section title={t("photo")}>
      <PhotoSources {...props} />
    </Section>
  );
}
