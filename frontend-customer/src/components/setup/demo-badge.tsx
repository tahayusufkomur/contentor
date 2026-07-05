"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { useDemoContent, type DemoContent } from "@/lib/setup-assistant";

export type DemoType = keyof DemoContent["ids"] | string;

export function DemoBadge({
  type,
  id,
}: {
  type: DemoType;
  id: string | number;
}) {
  const t = useTranslations("admin");
  const demo = useDemoContent();
  if (!demo?.ids?.[type as string]?.includes(String(id))) return null;
  return (
    <Badge
      variant="secondary"
      className="ml-2 align-middle text-[10px] uppercase"
    >
      {t("setup.demoBadge")}
    </Badge>
  );
}
