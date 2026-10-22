"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  EmailEditor,
  type BrandKit,
  type EmailDesign,
  type ImageValue,
} from "@shared/email/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { getBrand, renderEmail } from "@/lib/platform-email-api";

const SAVE_DELAY_MS = 800;

export interface EditableFields {
  subject: string;
  preheader: string;
  design: EmailDesign;
}

type SaveState = "saved" | "saving" | "unsaved" | "error";

/** One URL box, for a picture or a link (the platform has no media library). */
function UrlPrompt({
  title,
  initial,
  onDone,
}: {
  title: string;
  initial: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={() => onDone(null)}
      >
        <form
          className="w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            onDone(value.trim());
          }}
        >
          <h2 className="text-base font-semibold">{title}</h2>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onDone(null)}>
              Cancel
            </Button>
            <Button type="submit">Use</Button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}

/** The superadmin's email editor: subject, preview text and the shared editor,
 *  saved a moment after each change through `save`. */
export function PlatformEmailEditor({
  initial,
  save,
  flushRef,
  extraFields,
}: {
  initial: EditableFields;
  save: (fields: Partial<EditableFields>) => Promise<unknown>;
  /** Filled with a function that saves what is pending (before a send or a test). */
  flushRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  extraFields?: React.ReactNode;
}) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [subject, setSubject] = useState(initial.subject);
  const [preheader, setPreheader] = useState(initial.preheader);
  const [state, setState] = useState<SaveState>("saved");
  const [prompt, setPrompt] = useState<{
    title: string;
    initial: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const pending = useRef<Partial<EditableFields>>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    getBrand()
      .then(setKit)
      .catch(() => setState("error"));
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const fields = pending.current;
    pending.current = {};
    if (!Object.keys(fields).length) return;
    setState("saving");
    try {
      await save(fields);
      setState(Object.keys(pending.current).length ? "unsaved" : "saved");
    } catch {
      pending.current = { ...fields, ...pending.current };
      setState("error");
    }
  }, [save]);

  const queue = useCallback(
    (fields: Partial<EditableFields>) => {
      pending.current = { ...pending.current, ...fields };
      setState("unsaved");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the page saves what is pending.
  useEffect(() => {
    if (flushRef) flushRef.current = flush;
    return () => {
      void flush();
    };
  }, [flush, flushRef]);

  const ask = (title: string, current: string) =>
    new Promise<string | null>((resolve) =>
      setPrompt({ title, initial: current, resolve }),
    );

  const pickImage = async (): Promise<ImageValue | null> => {
    const src = await ask("Picture address", "");
    return src ? { src, alt: "" } : null;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Subject</span>
          <Input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              queue({ subject: e.target.value });
            }}
            placeholder="What's this email about?"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Preview text</span>
          <Input
            value={preheader}
            onChange={(e) => {
              setPreheader(e.target.value);
              queue({ preheader: e.target.value });
            }}
            placeholder="The line inboxes show after the subject"
          />
        </label>
        <p className="pb-2 text-xs text-muted-foreground" aria-live="polite">
          {
            {
              saved: "Saved",
              saving: "Saving…",
              unsaved: "Unsaved changes",
              error: "Couldn't save — retrying on your next change",
            }[state]
          }
        </p>
      </div>
      {extraFields}
      <div className="h-[calc(100dvh-16rem)] min-h-[560px] overflow-hidden rounded-xl border">
        {kit && (
          <EmailEditor
            value={initial.design}
            onChange={(design) => queue({ design })}
            kit={kit}
            features={{ items: false, brand: true }}
            pickImage={pickImage}
            pickLink={(current) => ask("Link address", current)}
            renderPreview={async (design) =>
              (await renderEmail(design, subject, preheader)).html
            }
          />
        )}
      </div>
      {prompt && (
        <UrlPrompt
          title={prompt.title}
          initial={prompt.initial}
          onDone={(value) => {
            prompt.resolve(value);
            setPrompt(null);
          }}
        />
      )}
    </div>
  );
}
