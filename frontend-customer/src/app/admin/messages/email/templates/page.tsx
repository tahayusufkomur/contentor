"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmailThumbnail } from "@/components/admin/email/email-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { SkeletonCardGrid } from "@/components/ui/skeletons";
import { Textarea } from "@/components/ui/textarea";
import {
  createDraft,
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  startDesigner,
  type EmailTemplate,
} from "@/lib/email-api";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { blankDesign } from "@shared/email/editor";

export const dynamic = "force-dynamic";

/** Her email templates: the ones made for her at setup, the Designer's, and her own. */
export default function EmailTemplatesPage() {
  const t = useTranslations("admin.messages");
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [asking, setAsking] = useState(false);
  const [brief, setBrief] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      setTemplates((await listTemplates()).results);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { run: newTemplate, loading: creating } = useAsyncAction(async () => {
    const template = await createTemplate({
      name: t("templates.defaultName"),
      design: blankDesign(),
    });
    navigate(`/admin/messages/email/templates/${template.id}`);
  });

  const { run: design, loading: designing } = useAsyncAction(async () => {
    const template = await createTemplate({
      name: t("templates.defaultName"),
      design: blankDesign(),
    });
    try {
      const job = await startDesigner({
        brief: brief.trim(),
        template_id: template.id,
        mode: "new",
      });
      navigate(`/admin/messages/email/templates/${template.id}?job=${job.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : t("designerUnavailable"),
      );
      navigate(`/admin/messages/email/templates/${template.id}`);
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1 border-b pb-5">
        <NavLink
          href="/admin/messages"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("title")}
        </NavLink>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("templates.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("templates.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setAsking((v) => !v)}
              aria-expanded={asking}
            >
              <Sparkles className="h-4 w-4" />
              {t("askDesigner")}
            </Button>
            <Button
              className="gap-2"
              onClick={() => newTemplate()}
              loading={creating}
              loadingText={t("templates.creating")}
            >
              <Plus className="h-4 w-4" />
              {t("templates.new")}
            </Button>
          </div>
        </div>
      </div>

      {asking && (
        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="font-semibold">{t("templates.fromDesigner")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("templates.kindPrompt")}
            </p>
          </div>
          <Textarea
            autoFocus
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t("templates.briefPlaceholder")}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)}>
              {t("templates.notNow")}
            </Button>
            <Button
              onClick={() => design()}
              disabled={!brief.trim()}
              loading={designing}
              loadingText={t("starting")}
            >
              <Sparkles className="h-4 w-4" />
              {t("designIt")}
            </Button>
          </div>
        </section>
      )}

      <PageState
        loading={loading}
        error={error}
        onRetry={() => {
          setLoading(true);
          load();
        }}
        skeleton={<SkeletonCardGrid count={6} />}
      >
        {templates.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t("templates.empty")}
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onChanged={load}
                onRemoved={() =>
                  setTemplates((cur) => cur.filter((x) => x.id !== tpl.id))
                }
              />
            ))}
          </ul>
        )}
      </PageState>
    </div>
  );
}

function TemplateCard({
  template,
  onChanged,
  onRemoved,
}: {
  template: EmailTemplate;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("admin.messages");
  const navigate = useNavigate();
  const editHref = `/admin/messages/email/templates/${template.id}`;

  const { run: write, loading: writing } = useAsyncAction(async () => {
    const draft = await createDraft({ template_id: template.id });
    navigate(`/admin/messages/email/${draft.id}/edit`);
  });
  const { run: duplicate, loading: duplicating } = useAsyncAction(async () => {
    await duplicateTemplate(template.id);
    toast.success(t("templates.duplicated"));
    onChanged();
  });
  const { run: remove, loading: removing } = useAsyncAction(async () => {
    if (!window.confirm(t("templates.confirmDelete", { name: template.name })))
      return;
    await deleteTemplate(template.id);
    toast.success(t("done.delete"));
    onRemoved();
  });

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      <NavLink
        href={editHref}
        className="block"
        aria-label={t("templates.editNamed", { name: template.name })}
      >
        <EmailThumbnail
          html={template.preview_html || ""}
          title={template.name}
          className="aspect-[4/5] w-full"
        />
      </NavLink>
      <div className="space-y-3 border-t px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{template.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t(`category.${template.category}`)}
              {template.subject ? ` · ${template.subject}` : ""}
            </p>
          </div>
          {template.source === "starter" && (
            <Badge variant="accent" className="shrink-0 whitespace-nowrap">
              {t("madeForYou")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => write()}
            loading={writing}
            loadingText={t("templates.opening")}
          >
            {t("templates.writeEmail")}
          </Button>
          <Button asChild size="sm" variant="outline">
            <NavLink href={editHref}>{t("campaign.edit")}</NavLink>
          </Button>
          <div className="ml-auto flex">
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground"
              onClick={() => duplicate()}
              loading={duplicating}
              title={t("templates.duplicate")}
              aria-label={t("templates.duplicateNamed", {
                name: template.name,
              })}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={() => remove()}
              loading={removing}
              title={t("action.delete")}
              aria-label={t("templates.deleteNamed", { name: template.name })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
