"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { blankDesign } from "@shared/email/editor";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { TemplateThumb } from "@/components/admin/email/template-thumb";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { SkeletonCardGrid } from "@/components/ui/skeletons";
import {
  createDraft,
  createTemplate,
  deleteTemplate,
  listTemplates,
  type PlatformTemplate,
} from "@/lib/platform-email-api";

export const dynamic = "force-dynamic";

/** The superadmin's email templates: use, edit, delete, or start a new one. */
export default function PlatformTemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<PlatformTemplate[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    listTemplates()
      .then((r) => setTemplates(r.results))
      .catch(setError);
  }, []);
  useEffect(load, [load]);

  const create = useAsyncAction(async () => {
    const t = await createTemplate({
      name: "New template",
      design: blankDesign(),
    });
    navigate(`/admin/email/templates/${t.id}`);
  });

  // Per-row actions stay independent (a shared hook would drop a second click).
  const use = async (t: PlatformTemplate) => {
    try {
      navigate(`/admin/email/drafts/${(await createDraft(t.id)).id}`);
    } catch {
      toast.error("Couldn't start an email from it.");
    }
  };
  const remove = async (t: PlatformTemplate) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try {
      await deleteTemplate(t.id);
      setTemplates((rows) => rows?.filter((r) => r.id !== t.id) ?? rows);
    } catch {
      toast.error("Couldn't delete it. Try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email templates</h1>
          <p className="text-sm text-muted-foreground">
            Designs you start emails to creators from.
          </p>
        </div>
        <Button
          onClick={() => create.run()}
          loading={create.loading}
          loadingText="Creating…"
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>
      <PageState
        loading={!templates && !error}
        error={error}
        onRetry={load}
        skeleton={<SkeletonCardGrid count={6} />}
      >
        {templates?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates?.map((t) => (
              <div key={t.id} className="space-y-3 rounded-xl border p-3">
                <TemplateThumb html={t.preview_html} title={t.name} />
                <p className="truncate px-1 text-sm font-medium">{t.name}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => use(t)}>
                    Use
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/admin/email/templates/${t.id}`)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    onClick={() => remove(t)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageState>
    </div>
  );
}
