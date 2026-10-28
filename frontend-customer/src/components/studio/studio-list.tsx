"use client";

import { dyn } from "@/i18n/dynamic";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { Images } from "lucide-react";
import { CoverThumb } from "@/components/studio/cover-thumb";
import { OpenStudioButton } from "@/components/studio/open-studio-button";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SkeletonCardGrid, SkeletonList } from "@/components/ui/skeletons";
import { useTenant } from "@/hooks/use-tenant";
import {
  targetAction,
  targetItem,
  targetNoun,
  targetState,
  type TargetState,
} from "@/lib/covers/targets";
import { useNavigate } from "@shared/navigation/navigation-provider";
import type { DesignTarget } from "@/types/design";

const STATE_BADGE: Record<TargetState, BadgeProps["variant"]> = {
  designed: "success",
  photo: "secondary",
  none: "outline",
  draft: "accent",
};

/** The list while it loads, in the shape it will take: rows on a phone, cards from `sm` up. */
export function StudioSkeleton() {
  return (
    <>
      <SkeletonList count={6} className="sm:hidden" />
      <SkeletonCardGrid
        count={6}
        className="hidden sm:grid lg:grid-cols-2 xl:grid-cols-3"
      />
    </>
  );
}

/** Her courses, her classes and events, then her downloads, each with the cover it wears and one button into the
 *  studio. An event series is every session of one kind with the same title: one cover for all. */
export function StudioList({ targets }: { targets: DesignTarget[] }) {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const timeZone = useTenant()?.timezone || "UTC";

  if (targets.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title={t("studio.empty.title")}
        description={t("studio.empty.description")}
        action={{
          label: t("studio.empty.action"),
          onClick: () => navigate("/admin/courses/new"),
        }}
      />
    );
  }
  return (
    <div className="space-y-8">
      <Section
        heading={t("nav.items.courses")}
        targets={targets.filter((x) => x.target_kind === "course")}
        timeZone={timeZone}
      />
      <Section
        heading={t("nav.items.liveEvents")}
        targets={targets.filter((x) => targetNoun(x.target_kind) === "event")}
        timeZone={timeZone}
      />
      <Section
        heading={t("nav.items.downloads")}
        targets={targets.filter((x) => x.target_kind === "download")}
        timeZone={timeZone}
      />
    </div>
  );
}

function Section({
  heading,
  targets,
  timeZone,
}: {
  heading: string;
  targets: DesignTarget[];
  timeZone: string;
}) {
  if (targets.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {targets.map((target) => (
          <TargetCard
            key={`${target.target_kind}:${target.target_key}`}
            target={target}
            timeZone={timeZone}
          />
        ))}
      </ul>
    </section>
  );
}

function TargetCard({
  target,
  timeZone,
}: {
  target: DesignTarget;
  timeZone: string;
}) {
  const t = useTranslations("admin");
  const titleId = useId();
  const state = targetState(target);
  const action = targetAction(target);
  const meta =
    targetNoun(target.target_kind) !== "event"
      ? target.status === "draft"
        ? t("studio.notPublished")
        : null
      : `${t(dyn(t, `events.kinds.${target.target_kind}.label`))} · ${t("studio.sessions", { count: target.sessions ?? 1 })}`;

  return (
    <li className="flex overflow-hidden rounded-lg border bg-card sm:flex-col">
      <CoverThumb
        design={target.cover}
        photoUrl={target.photo_url}
        item={targetItem(target, timeZone)}
        // A thumbnail beside the words on a phone (under 180 px the cover shows its photo alone);
        // from `sm` up it tops the card at 16:9.
        className="aspect-auto w-28 shrink-0 self-stretch rounded-none border-0 border-r sm:aspect-video sm:w-auto sm:self-auto sm:border-b sm:border-r-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="min-w-0 space-y-0.5">
          <h3 id={titleId} className="line-clamp-2 font-medium">
            {target.title}
          </h3>
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <Badge variant={STATE_BADGE[state]}>
            {t(`studio.state.${state}`)}
          </Badge>
          <OpenStudioButton
            target={target}
            from={action.from}
            aria-describedby={titleId}
          >
            {t(`studio.${action.key}`)}
          </OpenStudioButton>
        </div>
      </div>
    </li>
  );
}
