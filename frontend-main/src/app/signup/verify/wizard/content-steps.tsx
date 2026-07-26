"use client";

/** Content-first wizard steps (holdout "treatment"): the coach creates a real
 * course/event/blog post during signup instead of answering design questions.
 *
 * Every write needs a tenant schema, which does not exist yet at this point in
 * signup — so the chapter is wrapped in ProvisioningGate, which triggers early
 * provisioning (Plan 3a) and holds the form until the schema is ready.
 * Skipping is always allowed: no flag is set, so the publish gate and the admin
 * checklist still surface the gap later. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  createWizardBlog,
  createWizardCourse,
  createWizardEvent,
  getCourseOutlines,
  provisionWizard,
  type CourseOutline,
} from "@/lib/wizard/api";
import type { WizardAnswers } from "@/lib/wizard/types";

import { OptionCard, OptionList, SlideHeader } from "./steps";

const POLL_MS = 1500;
const READY_STATUSES = ["provisioned", "ready"];

/** Provision on mount, poll until the schema exists, then reveal children. */
export function ProvisioningGate({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("wizard");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const { status } = await provisionWizard(token);
        if (!alive) return;
        if (READY_STATUSES.includes(status)) {
          setReady(true);
          return;
        }
      } catch {
        // Transient failure: keep polling rather than stranding the coach.
        if (!alive) return;
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token]);

  if (!ready) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner />
        <p className="text-[14px] text-muted-foreground">
          {t("content.provisioning")}
        </p>
        <p className="text-[12px] text-muted-foreground/70">
          {t("content.provisioningHint")}
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

interface StepProps {
  token: string;
  answers: WizardAnswers;
  onDone: (patch: Partial<WizardAnswers>) => void;
  onSkip: () => void;
}

/** Skip link + primary action, shared by all three content steps. */
function StepActions({
  onSkip,
  onSave,
  disabled,
  saving,
}: {
  onSkip: () => void;
  onSave: () => void;
  disabled: boolean;
  saving: boolean;
}) {
  const t = useTranslations("wizard");
  return (
    <div className="mt-6 flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={onSkip}
        className="text-[13px] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        {t("content.skip")}
      </button>
      <Button onClick={onSave} disabled={disabled} loading={saving}>
        {t("common.continue")}
      </Button>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary";

export function CourseStep({ token, onDone, onSkip }: StepProps) {
  const t = useTranslations("wizard");
  const [outlines, setOutlines] = useState<CourseOutline[] | null>(null);
  const [chosen, setChosen] = useState<CourseOutline | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void getCourseOutlines(token)
      .then((r) => alive && setOutlines(r.outlines))
      .catch(() => alive && setOutlines([]));
    return () => {
      alive = false;
    };
  }, [token]);

  const save = useCallback(async () => {
    if (!chosen || saving) return;
    setSaving(true);
    try {
      await createWizardCourse(token, {
        title: chosen.title,
        description: chosen.description,
        price: chosen.suggested_price,
      });
      onDone({ course_created: true });
    } finally {
      setSaving(false);
    }
  }, [chosen, saving, token, onDone]);

  return (
    <div>
      <SlideHeader
        heading={t("content.courseTitle")}
        subhead={t("content.coursePrompt")}
      />
      {outlines === null ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : outlines.length === 0 ? (
        <p className="mt-6 text-center text-[14px] text-muted-foreground">
          {t("content.courseEmpty")}
        </p>
      ) : (
        <OptionList className="mt-5 grid gap-2">
          {outlines.map((o) => (
            <OptionCard
              key={o.title}
              selected={chosen?.title === o.title}
              onSelect={() => setChosen(o)}
              title={o.title}
              subtitle={o.description}
              badge={
                o.suggested_price > 0
                  ? String(o.suggested_price)
                  : t("content.free")
              }
            />
          ))}
        </OptionList>
      )}
      <StepActions
        onSkip={onSkip}
        onSave={() => void save()}
        disabled={!chosen}
        saving={saving}
      />
    </div>
  );
}

export function EventStep({ token, onDone, onSkip }: StepProps) {
  const t = useTranslations("wizard");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = useCallback(async () => {
    if (!title.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await createWizardEvent(token, {
        kind: "live",
        title: title.trim(),
        scheduled_at: date ? new Date(date).toISOString() : undefined,
      });
      onDone({ event_created: true });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [title, date, token, onDone]);

  return (
    <div>
      <SlideHeader
        heading={t("content.eventTitle")}
        subhead={t("content.eventPrompt")}
      />
      <div className="mt-5 space-y-4">
        <label className="block text-[13px] text-muted-foreground">
          {t("content.titleLabel")}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-[13px] text-muted-foreground">
          {t("content.dateLabel")}
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <StepActions
        onSkip={onSkip}
        onSave={() => void save()}
        disabled={!title.trim()}
        saving={saving}
      />
    </div>
  );
}

export function BlogStep({ token, onDone, onSkip }: StepProps) {
  const t = useTranslations("wizard");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = useCallback(async () => {
    if (!title.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Published: only a published post satisfies the publish gate's blog
      // requirement, and this step exists precisely to satisfy it.
      await createWizardBlog(token, {
        title: title.trim(),
        status: "published",
      });
      onDone({ blog_created: true });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [title, token, onDone]);

  return (
    <div>
      <SlideHeader
        heading={t("content.blogTitle")}
        subhead={t("content.blogPrompt")}
      />
      <label className="mt-5 block text-[13px] text-muted-foreground">
        {t("content.titleLabel")}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </label>
      <StepActions
        onSkip={onSkip}
        onSave={() => void save()}
        disabled={!title.trim()}
        saving={saving}
      />
    </div>
  );
}
