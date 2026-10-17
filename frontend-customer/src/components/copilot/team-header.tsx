"use client";

import { useTranslations } from "next-intl";

import { SPECIALIST_KEYS, type SpecialistKey } from "@/lib/copilot/team";
import { cn } from "@/lib/utils";
import { SpecialistFace } from "./specialist-face";

/** The six faces at the top of the docked panel: who answers, and why. The
 *  section she is in picks the specialist until she picks one herself. */
export function TeamHeader({
  active,
  picked,
  sectionLabel,
  onPick,
}: {
  active: SpecialistKey;
  picked: boolean;
  sectionLabel: string;
  onPick: (k: SpecialistKey) => void;
}) {
  const t = useTranslations("admin");
  return (
    <div className="border-b px-3 py-2.5">
      <div
        role="group"
        aria-label={t("team.label")}
        className="flex flex-wrap gap-1.5"
      >
        {SPECIALIST_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === active}
            aria-label={t(`team.specialists.${k}.name`)}
            title={t(`team.specialists.${k}.name`)}
            onClick={() => onPick(k)}
            className={cn(
              "rounded-full p-0.5 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
              k === active
                ? "ring-2 ring-foreground/70"
                : "opacity-55 hover:opacity-100",
            )}
          >
            <SpecialistFace k={k} />
          </button>
        ))}
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">
        {t(`team.specialists.${active}.name`)}
      </p>
      <p className="text-xs text-muted-foreground">
        {t(`team.specialists.${active}.job`)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {picked
          ? t("team.picked")
          : t("team.answersIn", { section: sectionLabel })}
      </p>
    </div>
  );
}
