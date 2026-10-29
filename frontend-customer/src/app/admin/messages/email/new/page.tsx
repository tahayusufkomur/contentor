"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, FilePlus2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { EmailThumbnail } from "@/components/admin/email/email-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { SkeletonCardGrid } from "@/components/ui/skeletons";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  createDraft,
  getCatalog,
  listTemplates,
  startDesigner,
  type CatalogEntry,
  type CatalogSlot,
  type EmailTemplate,
  type RecipientFilter,
} from "@/lib/email-api";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

const MAX_FEATURED = 3;

/** Where every designed email starts: one of her templates (the ones made for
 *  her at setup first), the Designer from a brief, or a blank page in her brand.
 *  Old links still work: `?template=<id>` opens that template straight away,
 *  `?recipient=<id>` addresses the draft to one student, `?subject=` names it. */
export default function NewEmailPage() {
  const t = useTranslations("admin.messages");
  const navigate = useNavigate();
  const params = useSearchParams();
  const templateParam = Number(params.get("template")) || 0;
  const recipientParam = Number(params.get("recipient")) || 0;
  const subjectParam = params.get("subject") || "";
  const base = {
    ...(subjectParam ? { subject: subjectParam } : {}),
    ...(recipientParam
      ? {
          recipient_filter: {
            type: "individual",
            user_ids: [recipientParam],
          } as RecipientFilter,
        }
      : {}),
  };

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [items, setItems] = useState<CatalogEntry[]>([]);
  const [slots, setSlots] = useState<CatalogSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (templateParam) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listTemplates(), getCatalog().catch(() => null)])
      .then(([list, catalog]) => {
        if (cancelled) return;
        setTemplates(list.results);
        setItems(catalog?.items ?? []);
        setSlots(catalog?.slots ?? []);
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [templateParam, reloadKey]);

  const { run: open } = useAsyncAction(
    async (key: string, templateId?: number) => {
      setOpening(key);
      try {
        const draft = await createDraft({
          ...base,
          ...(templateId ? { template_id: templateId } : {}),
        });
        navigate(`/admin/messages/email/${draft.id}/edit`);
      } catch (err) {
        setOpening(null);
        throw err;
      }
    },
  );

  // An old link to a template: open it right away (a MailCraft id is not a number and is ignored).
  const started = useRef(false);
  useEffect(() => {
    if (!templateParam || started.current) return;
    started.current = true;
    open(`template-${templateParam}`, templateParam);
  }, [templateParam, open]);

  if (templateParam) {
    return <Spinner center size="lg" label={t("newEmail.openingTemplate")} />;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1 border-b pb-5">
        <NavLink
          href="/admin/messages"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("title")}
        </NavLink>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("newEmail.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("newEmail.subtitle")}
        </p>
      </div>

      <PageState
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<SkeletonCardGrid count={6} />}
      >
        <AskTheDesigner
          items={items}
          slots={slots}
          base={base}
          disabled={opening !== null}
        />

        <section className="mt-8 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {t("newEmail.yourTemplates")}
            </h2>
            <NavLink
              href="/admin/messages/email/templates"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("newEmail.manageTemplates")}
            </NavLink>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.map((tpl) => (
              <li key={tpl.id}>
                <button
                  type="button"
                  disabled={opening !== null}
                  onClick={() => open(`template-${tpl.id}`, tpl.id)}
                  className="group w-full overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <div className="relative">
                    <EmailThumbnail
                      html={tpl.preview_html || ""}
                      title={tpl.name}
                      className="aspect-[4/5] w-full"
                    />
                    {opening === `template-${tpl.id}` && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <Spinner label={t("newEmail.opening")} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{tpl.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tpl.subject || t(`category.${tpl.category}`)}
                      </p>
                    </div>
                    {tpl.source === "starter" && (
                      <Badge
                        variant="accent"
                        className="shrink-0 whitespace-nowrap"
                      >
                        {t("madeForYou")}
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                disabled={opening !== null}
                onClick={() => open("blank")}
                className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                {opening === "blank" ? (
                  <Spinner label={t("newEmail.opening")} />
                ) : (
                  <FilePlus2 className="h-6 w-6" />
                )}
                <span className="font-medium">{t("newEmail.blank")}</span>
                <span className="px-6 text-center text-xs">
                  {t("newEmail.blankHint")}
                </span>
              </button>
            </li>
          </ul>
        </section>
      </PageState>
    </div>
  );
}

function AskTheDesigner({
  items,
  slots,
  base,
  disabled,
}: {
  items: CatalogEntry[];
  slots: CatalogSlot[];
  base: { subject?: string; recipient_filter?: RecipientFilter };
  disabled: boolean;
}) {
  const t = useTranslations("admin.messages");
  const navigate = useNavigate();
  const [brief, setBrief] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);
  // A weekly class is one chip: its next date is what a "next class" slot already shows.
  const seen = new Set<string>();
  const choices = [
    ...slots.map((s) => ({ ref: s.ref, label: s.slotLabel })),
    ...items
      .filter((i) => i.kind !== "page")
      .map((i) => ({ ref: i.ref, label: i.title })),
  ]
    .filter((c) => !seen.has(c.label) && seen.add(c.label))
    .slice(0, 12);

  const toggle = (ref: string) =>
    setRefs((cur) =>
      cur.includes(ref)
        ? cur.filter((r) => r !== ref)
        : cur.length < MAX_FEATURED
          ? [...cur, ref]
          : cur,
    );

  const { run: design, loading } = useAsyncAction(async () => {
    const draft = await createDraft(base);
    try {
      const job = await startDesigner({
        brief: brief.trim(),
        campaign_id: draft.id,
        mode: "new",
        refs,
      });
      setLeaving(true);
      navigate(`/admin/messages/email/${draft.id}/edit?job=${job.id}`);
    } catch (err) {
      // The draft is there: she can still write it herself.
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : t("designerUnavailable"),
      );
      setLeaving(true);
      navigate(`/admin/messages/email/${draft.id}/edit`);
    }
  });

  const writing = brief.trim().length > 0;

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={writing ? 3 : 1}
              maxLength={2000}
              aria-label={t("askDesigner")}
              placeholder={t("newEmail.designerPlaceholder")}
              className="min-h-0 resize-none"
            />
            <Button
              onClick={() => design()}
              disabled={!writing || disabled}
              loading={loading || leaving}
              loadingText={t("starting")}
              className="shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              {t("designIt")}
            </Button>
          </div>
          {writing && choices.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {t("newEmail.feature", { max: MAX_FEATURED })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {choices.map((c) => {
                  const on = refs.includes(c.ref);
                  return (
                    <button
                      key={c.ref}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(c.ref)}
                      className={cn(
                        "max-w-[16rem] truncate rounded-full border px-3 py-1 text-xs transition-colors",
                        on
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
