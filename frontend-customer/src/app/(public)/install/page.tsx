import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { InstallGuide } from "@/components/install/install-guide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pwa");
  return {
    title: t("guide.title"),
    description: t("guide.metaDescription"),
  };
}

export default function InstallPage() {
  return <InstallGuide />;
}
