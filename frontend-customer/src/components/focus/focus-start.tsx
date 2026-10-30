"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { startActiveTime, takeActiveMs } from "@/lib/focus/active-time";
import {
  fetchCreation,
  leaveCreation,
  startCreation,
  type FocusQuestion,
  type FocusState,
} from "@/lib/focus/api";
import { focusTimeKey, KIND_ROUTES, type FocusKind } from "@/lib/focus/kinds";
import {
  applyCreation,
  claimStart,
  refreshFocusOverview,
  setActiveCreation,
  useActiveCreation,
} from "@/lib/focus/store";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

/** "New course" in focus mode: the course page, still empty, while the guide
 *  asks the first question. Her first answer creates the draft and brings her
 *  to its page, where it takes shape. A kind whose draft waits for a later
 *  answer (an event, G10) stays here until then; `resume` is such a creation
 *  she left, picked up where she stopped. */
export function FocusStart({
  kind,
  question,
  resume = null,
  children,
}: {
  kind: FocusKind;
  question: FocusQuestion;
  /** Her open creation of this kind with no record yet. */
  resume?: number | null;
  /** The kind's empty page; the course's when omitted. */
  children?: ReactNode;
}) {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const timeKey = focusTimeKey(kind);
  // Her words from the assistant are her first answer, as if typed here.
  const { run: sendFirst } = useAsyncAction(async (text: string) => {
    const next = await startCreation({
      kind,
      text,
      active_ms: takeActiveMs(timeKey),
    });
    void refreshFocusOverview();
    if (applyCreation(0, next) && next.record) navigate(next.record.path);
  });
  // Once per visit to this page (Back from a course included): a fresh first
  // question. Not again while her first answer moves her on to the course.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startActiveTime(timeKey, true);
    const start = claimStart(resume);
    if (start.resume) {
      void fetchCreation(start.resume)
        .then((state) => {
          if (state.status !== "active") return fresh();
          setActiveCreation(state);
          if (state.record) navigate(state.record.path); // made meanwhile
        })
        .catch(fresh);
      return;
    }
    // New words from the assistant: the one she left here ends (it has no
    // record yet, so nothing is lost but its answers) and they start afresh.
    if (resume && start.words)
      void leaveCreation(resume, { abandon: true }).catch(() => {});
    fresh();
    if (start.words) void sendFirst(start.words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, question]);
  // A later answer made the draft (she said where): on to its page.
  const active = useActiveCreation();
  const before = useRef<FocusState | null>(null);
  useEffect(() => {
    const prev = before.current;
    before.current = active;
    if (active?.record && prev?.id === active.id && !prev.record)
      navigate(active.record.path);
  }, [active, navigate]);

  function fresh() {
    setActiveCreation({
      id: 0,
      kind,
      status: "active",
      chat: null,
      record: null,
      question,
      answered: [],
      outline: { status: "idle", run: null, drafted: false },
      reading: null,
      thinking: null,
      descriptions: null,
      cover: null,
      announcement: null,
      steps: [],
    });
  }

  return (
    <div className="space-y-6">
      {children ?? <CourseSlots />}
      <NavLink
        href={KIND_ROUTES[kind]?.plainHref ?? "/admin"}
        className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t(`focus.kinds.${kind}.fillMyself`)}
      </NavLink>
    </div>
  );
}

function CourseSlots() {
  const t = useTranslations("admin");
  const slot = "rounded-md border border-dashed border-border bg-muted/30";
  return (
    <>
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label>{t("courseForm.title")}</Label>
            <div className={`h-10 ${slot}`} />
          </div>
          <div className="space-y-2">
            <Label>{t("courseForm.description")}</Label>
            <div className={`h-[120px] ${slot}`} />
          </div>
          <div className="space-y-2">
            <Label>{t("courseForm.thumbnail")}</Label>
            <div className={`aspect-video w-48 ${slot}`} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("courseForm.curriculum")}</CardTitle>
          <CardDescription>{t("focus.outlineSoon")}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
