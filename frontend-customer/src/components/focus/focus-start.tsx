"use client";

import { useEffect, useRef } from "react";
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
import { startCreation, type FocusQuestion } from "@/lib/focus/api";
import {
  applyCreation,
  refreshFocusOverview,
  setActiveCreation,
  takeFirstAnswer,
} from "@/lib/focus/store";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

import { FOCUS_TIME_KEY } from "./focus-guide";

/** "New course" in focus mode: the course page, still empty, while the guide
 *  asks the first question. Her first answer creates the draft and brings her
 *  to its page, where it takes shape. */
export function FocusStart({
  kind,
  question,
}: {
  kind: string;
  question: FocusQuestion;
}) {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  // Her words from the assistant are her first answer, as if typed here.
  const { run: sendFirst } = useAsyncAction(async (text: string) => {
    const next = await startCreation({
      kind,
      text,
      active_ms: takeActiveMs(FOCUS_TIME_KEY),
    });
    void refreshFocusOverview();
    if (applyCreation(0, next) && next.record)
      navigate(`/admin/courses/${next.record.slug}`);
  });
  // Once per visit to this page (Back from a course included): a fresh first
  // question. Not again while her first answer moves her on to the course.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startActiveTime(FOCUS_TIME_KEY, true);
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
    const words = takeFirstAnswer();
    if (words) void sendFirst(words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, question]);

  const slot = "rounded-md border border-dashed border-border bg-muted/30";
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label>Title</Label>
            <div className={`h-10 ${slot}`} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <div className={`h-[120px] ${slot}`} />
          </div>
          <div className="space-y-2">
            <Label>Thumbnail</Label>
            <div className={`aspect-video w-48 ${slot}`} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Curriculum</CardTitle>
          <CardDescription>{t("focus.outlineSoon")}</CardDescription>
        </CardHeader>
      </Card>
      <NavLink
        href="/admin/courses/new?form=1"
        className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t("focus.fillMyself")}
      </NavLink>
    </div>
  );
}
