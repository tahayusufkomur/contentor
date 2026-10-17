"use client";

import { useTranslations } from "next-intl";

import { useBusySpecialists } from "@/lib/copilot/runs";
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
  const busy = useBusySpecialists();
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
            // Selected wears an outline; keyboard focus gets the studio's
            // 3px ring, so the two never look alike.
            className={cn(
              "rounded-full p-0.5 transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              k === active
                ? "outline outline-2 outline-offset-1 outline-foreground/70"
                : "opacity-75 outline-none hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <SpecialistFace k={k} busy={busy.includes(k)} />
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
