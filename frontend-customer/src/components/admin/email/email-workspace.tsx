"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { ImageLibraryDialog } from "@/components/admin/blog/image-library-dialog";
import { ItemPickerModal } from "@/components/admin/email/item-picker";
import { LinkPickerModal } from "@/components/owner/link-picker";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  createDraft,
  emailImage,
  getBrandKit,
  getCampaign,
  getCatalog,
  getDesignerJob,
  getTemplate,
  renderEmail,
  saveAsTemplate,
  sendTest,
  startDesigner,
  updateDraft,
  updateTemplate,
  type CatalogEntry,
  type CatalogSlot,
  type DesignerJob,
} from "@/lib/email-api";
import { useAssistantApplied } from "@/lib/site-events";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import {
  EmailEditor,
  blockLabel,
  normalizeDesign,
  type Block,
  type BrandKit,
  type CatalogItem,
  type EmailDesign,
  type ImageValue,
} from "@shared/email/editor";

export type WorkspaceTarget =
  | { kind: "campaign"; id: number }
  | { kind: "template"; id: number };

interface Fields {
  name?: string;
  subject?: string;
  preheader?: string;
  design?: EmailDesign;
}

const SAVE_AFTER_MS = 800;
const POLL_MS = 1500;
const RUNNING = new Set(["queued", "working"]);

/** A run started elsewhere (the start screen, the assistant), until its first poll. */
const queuedJob = (id: number, step: string): DesignerJob => ({
  id,
  status: "queued",
  step,
  warnings: [],
  error: "",
  campaign: null,
  template: null,
});

/** One email (a draft) or one template open in the editor: her subject and
 *  preview text on top, the Designer one line below, the editor filling the
 *  rest. Everything she changes saves on its own. */
export function EmailWorkspace({ target }: { target: WorkspaceTarget }) {
  const tr = useTranslations("admin.email.workspace");
  const isTemplate = target.kind === "template";
  const navigate = useNavigate();
  const router = useRouter();
  const params = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [items, setItems] = useState<CatalogEntry[]>([]);
  const [slots, setSlots] = useState<CatalogSlot[]>([]);
  const [design, setDesign] = useState<EmailDesign | null>(null);
  const [syncKey, setSyncKey] = useState(0);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");

  // ── load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (isTemplate) return getTemplate(target.id);
    return getCampaign(target.id);
  }, [isTemplate, target.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([load(), getBrandKit(), getCatalog()])
      .then(([doc, brandKit, catalog]) => {
        if (cancelled) return;
        if (!isTemplate && "status" in doc && doc.status !== "draft") {
          // It went out (or is on its way): its record, not the editor.
          router.replace(`/admin/messages/email/${target.id}`);
          return;
        }
        setKit(brandKit);
        setItems(catalog.items);
        setSlots(catalog.slots);
        setDesign(normalizeDesign(doc.design));
        setSubject(doc.subject || "");
        setPreheader(doc.preheader || "");
        if ("name" in doc) setName(doc.name);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, isTemplate, target.id, router, reloadKey]);

  // ── autosave ──────────────────────────────────────────────────────────
  const pending = useRef<Fields>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );

  const save = useCallback(
    (fields: Fields) =>
      isTemplate
        ? updateTemplate(target.id, fields)
        : updateDraft(target.id, fields),
    [isTemplate, target.id],
  );

  /** Save what is waiting now; resolves once every save so far is done. */
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const fields = pending.current;
    pending.current = {};
    if (Object.keys(fields).length) {
      chain.current = chain.current.then(async () => {
        setSaveState("saving");
        try {
          await save(fields);
          setSaveState(
            Object.keys(pending.current).length ? "saving" : "saved",
          );
        } catch (err) {
          // Keep what failed for the next try, unless she changed it since.
          pending.current = { ...fields, ...pending.current };
          setSaveState("error");
          throw err;
        }
      });
    }
    return chain.current;
  }, [save]);

  const queue = useCallback(
    (fields: Fields) => {
      pending.current = { ...pending.current, ...fields };
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        flush().catch(() => toast.error(tr("saveRetry")));
      }, SAVE_AFTER_MS);
    },
    [flush, tr],
  );

  // Leaving the page saves what is waiting; closing the tab asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      flush().catch(() => {});
    };
  }, [flush]);

  const onDesignChange = useCallback(
    (next: EmailDesign) => queue({ design: next }),
    [queue],
  );

  // ── the Designer ──────────────────────────────────────────────────────
  const [job, setJob] = useState<DesignerJob | null>(null);
  const [brief, setBrief] = useState("");
  const running = !!job && RUNNING.has(job.status);
  // The block she selected: the Designer changes only it, unless she lets it go.
  const [focus, setFocus] = useState<{ id: string; label: string } | null>(
    null,
  );
  const onSelectBlock = useCallback(
    (block: Block | null) =>
      setFocus(block && { id: block.id, label: blockLabel(block.type) }),
    [],
  );

  // A run started on the previous screen (the start screen's brief) is picked up here.
  const jobParam = Number(params.get("job")) || 0;
  useEffect(() => {
    if (jobParam) setJob(queuedJob(jobParam, tr("readingBrief")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the step text is only the placeholder until the first poll
  }, [jobParam]);

  // The assistant changes this email: its run plays here like the bar's.
  useAssistantApplied((applied) => {
    if (
      applied.kind === "edit_email" &&
      applied.job &&
      applied.target === target.kind &&
      applied.id === target.id
    )
      setJob(queuedJob(applied.job, tr("readingBrief")));
  });

  const finishJob = useCallback(
    async (done: DesignerJob) => {
      if (jobParam) {
        // The run is over: a reload should not pick it up again.
        const url = new URL(window.location.href);
        url.searchParams.delete("job");
        window.history.replaceState({}, "", url.toString());
      }
      if (done.status === "failed") {
        toast.error(done.error || tr("designerFailed"));
        return;
      }
      const doc = await load();
      setDesign(normalizeDesign(doc.design));
      setSyncKey((k) => k + 1);
      setSubject(doc.subject || "");
      setPreheader(doc.preheader || "");
      if ("name" in doc) setName(doc.name);
      setSaveState("saved");
      if (done.warnings.length) {
        toast.message(tr("designerDone"), {
          description: done.warnings.join(" "),
        });
      } else {
        toast.success(tr("designerDoneUndo"));
      }
    },
    [jobParam, load, tr],
  );

  useEffect(() => {
    if (!job || !RUNNING.has(job.status)) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const next = await getDesignerJob(job.id);
        if (cancelled) return;
        if (RUNNING.has(next.status)) setJob(next);
        else {
          setJob(null);
          await finishJob(next);
        }
      } catch {
        if (!cancelled) setJob((j) => (j ? { ...j } : j)); // try again
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [job, finishJob]);

  const { run: askDesigner, loading: asking } = useAsyncAction(async () => {
    const request = brief.trim();
    if (!request) return;
    await flush();
    const started = await startDesigner({
      brief: request,
      mode: "edit",
      ...(focus ? { block_id: focus.id } : {}),
      ...(isTemplate ? { template_id: target.id } : { campaign_id: target.id }),
    });
    setBrief("");
    setJob(started);
  });

  // ── pickers (the editor asks; a dialog answers) ───────────────────────
  type Picker =
    | { kind: "image"; resolve: (v: ImageValue | null) => void }
    | { kind: "link"; current: string; resolve: (v: string | null) => void }
    | { kind: "item"; resolve: (v: CatalogItem | null) => void };
  const [picker, setPicker] = useState<Picker | null>(null);

  const pickImage = useCallback(
    () =>
      new Promise<ImageValue | null>((resolve) =>
        setPicker({ kind: "image", resolve }),
      ),
    [],
  );
  const pickLink = useCallback(
    (current: string) =>
      new Promise<string | null>((resolve) =>
        setPicker({ kind: "link", current, resolve }),
      ),
    [],
  );
  const pickItem = useCallback(
    () =>
      new Promise<CatalogItem | null>((resolve) =>
        setPicker({ kind: "item", resolve }),
      ),
    [],
  );
  const close = useCallback(
    (value: ImageValue | string | CatalogItem | null) => {
      setPicker((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p?.resolve(value as any);
        return null;
      });
    },
    [],
  );

  const latestMeta = useRef({ subject, preheader });
  latestMeta.current = { subject, preheader };
  const renderPreview = useCallback(
    (d: EmailDesign) =>
      renderEmail(
        d,
        latestMeta.current.subject,
        latestMeta.current.preheader,
      ).then((r) => r.html),
    [],
  );

  const editorItems = useMemo<CatalogItem[]>(
    () => [...slots, ...items],
    [slots, items],
  );

  // ── actions ───────────────────────────────────────────────────────────
  const { run: test, loading: testing } = useAsyncAction(async () => {
    await flush();
    const { sent_to } = await sendTest(target.id);
    toast.success(tr("testSent", { email: sent_to }));
  });

  const { run: keepAsTemplate, loading: keeping } = useAsyncAction(async () => {
    await flush();
    const template = await saveAsTemplate(target.id, subject || undefined);
    toast.success(tr("savedAsTemplate", { name: template.name }));
  });

  const [leaving, setLeaving] = useState(false);
  const { run: next, loading: toSend } = useAsyncAction(async () => {
    await flush();
    setLeaving(true);
    navigate(`/admin/messages/email/${target.id}/send`);
  });

  const { run: startFromTemplate, loading: using } = useAsyncAction(
    async () => {
      await flush();
      const draft = await createDraft({ template_id: target.id });
      setLeaving(true);
      navigate(`/admin/messages/email/${draft.id}/edit`);
    },
  );

  const back = isTemplate
    ? { href: "/admin/messages/email/templates", label: tr("templates") }
    : { href: "/admin/messages", label: tr("messages") };

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<WorkspaceSkeleton />}
      className="h-full"
    >
      {design && kit && (
        <div className="flex h-full min-h-[640px] flex-col">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3 lg:px-4 lg:py-2.5">
            <NavLink
              href={back.href}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {back.label}
            </NavLink>
            <div className="hidden h-6 w-px bg-border sm:block" aria-hidden />
            <div className="min-w-0 flex-1 basis-64">
              {isTemplate && (
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    queue({ name: e.target.value });
                  }}
                  aria-label={tr("templateName")}
                  placeholder={tr("templateName")}
                  className="w-full truncate bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
                />
              )}
              <input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  queue({ subject: e.target.value });
                }}
                aria-label={tr("subject")}
                placeholder={tr("subjectPlaceholder")}
                className={cn(
                  "w-full truncate bg-transparent outline-none placeholder:text-muted-foreground",
                  isTemplate ? "text-sm" : "text-base font-semibold",
                )}
              />
              <input
                value={preheader}
                onChange={(e) => {
                  setPreheader(e.target.value);
                  queue({ preheader: e.target.value });
                }}
                aria-label={tr("previewText")}
                placeholder={tr("previewPlaceholder")}
                className="w-full truncate bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <SaveStatus state={saveState} />
            {isTemplate ? (
              <Button
                size="sm"
                onClick={() => startFromTemplate()}
                loading={using || leaving}
                loadingText={tr("opening")}
              >
                {tr("writeWithIt")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => keepAsTemplate()}
                  loading={keeping}
                  loadingText={tr("saving")}
                >
                  {tr("saveAsTemplate")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => test()}
                  loading={testing}
                  loadingText={tr("sending")}
                >
                  {tr("sendTest")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => next()}
                  loading={toSend || leaving}
                  loadingText={tr("saving")}
                >
                  {tr("nextSend")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {running ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2.5 border-b bg-muted/30 px-1 py-2.5 text-sm lg:px-4"
            >
              <Spinner size="sm" label={tr("designerWorking")} />
              <span className="truncate">
                {job?.step || tr("designerWorkingText")}
              </span>
            </div>
          ) : (
            <form
              className="flex items-center gap-2 border-b py-2 lg:px-4"
              onSubmit={(e) => {
                e.preventDefault();
                askDesigner();
              }}
            >
              <Sparkles
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              {focus && (
                <span
                  className="flex shrink-0 items-center gap-0.5 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs"
                  title={tr("onlyThisBlock")}
                >
                  {focus.label}
                  <button
                    type="button"
                    onClick={() => setFocus(null)}
                    aria-label={tr("askWhole")}
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <input
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                aria-label={tr("askDesigner")}
                placeholder={
                  focus ? tr("askBlockPlaceholder") : tr("askPlaceholder")
                }
                className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!brief.trim()}
                loading={asking}
                loadingText={tr("asking")}
              >
                {tr("ask")}
              </Button>
            </form>
          )}

          <div className="relative min-h-0 flex-1 pt-3 lg:pt-0">
            <EmailEditor
              value={design}
              onChange={onDesignChange}
              syncKey={syncKey}
              kit={kit}
              items={editorItems}
              pickImage={pickImage}
              pickLink={pickLink}
              pickItem={pickItem}
              renderPreview={renderPreview}
              onSelect={onSelectBlock}
              className="lg:rounded-none lg:border-0"
            />
            {running && (
              // Her changes would be overwritten when the Designer hands the email back.
              <div
                className="absolute inset-0 z-30 cursor-wait bg-background/60 backdrop-blur-[1px]"
                aria-hidden
              />
            )}
          </div>

          {picker?.kind === "image" && (
            <ImageLibraryDialog
              open
              title={tr("choosePhoto")}
              onOpenChange={(open) => !open && close(null)}
              onSelect={async (photo) => {
                try {
                  close(await emailImage(photo.id));
                } catch {
                  toast.error(tr("photoError"));
                  close(null);
                }
              }}
            />
          )}
          {picker?.kind === "link" && (
            <LinkPickerModal
              initialValue={picker.current}
              onPick={(href) => close(href)}
              onClose={() => close(null)}
            />
          )}
          {picker?.kind === "item" && (
            <ItemPickerModal
              items={items}
              slots={slots}
              onPick={(item) => close(item)}
              onClose={() => close(null)}
            />
          )}
        </div>
      )}
    </PageState>
  );
}

function SaveStatus({ state }: { state: "saved" | "saving" | "error" }) {
  const tr = useTranslations("admin.email.workspace.saveState");
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs",
        state === "error" ? "text-destructive" : "text-muted-foreground",
      )}
      aria-live="polite"
    >
      {state === "saved" && <Check className="h-3.5 w-3.5" />}
      {tr(state)}
    </span>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="flex h-full min-h-[640px] flex-col gap-3 lg:gap-0">
      <div className="flex items-center gap-3 border-b pb-3 lg:px-4 lg:py-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[232px_minmax(0,1fr)_320px]">
        <div className="hidden space-y-2 border-r p-3 lg:block">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="flex-1 bg-muted/30 p-6">
          <Skeleton className="mx-auto h-full min-h-[420px] max-w-[600px]" />
        </div>
        <div className="hidden space-y-3 border-l p-4 lg:block">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
