"use client";

import { useEffect, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";

import { useNavigate } from "@shared/navigation/navigation-provider";
import { TemplateThumb } from "@/components/admin/email/template-thumb";
import { PageState } from "@/components/ui/page-state";
import { SkeletonCardGrid } from "@/components/ui/skeletons";
import { Spinner } from "@/components/ui/spinner";
import {
  createDraft,
  listTemplates,
  type PlatformTemplate,
} from "@/lib/platform-email-api";

export const dynamic = "force-dynamic";

/** Start an email to creators: from a template, or blank. Either makes a draft and opens it. */
export default function PlatformComposePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<PlatformTemplate[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [opening, setOpening] = useState<number | "blank" | null>(null);

  useEffect(() => {
    listTemplates()
      .then((r) => setTemplates(r.results))
      .catch(setError);
  }, []);

  const start = async (key: number | "blank") => {
    if (opening !== null) return;
    setOpening(key);
    try {
      const draft = await createDraft(key === "blank" ? undefined : key);
      navigate(`/admin/email/drafts/${draft.id}`);
    } catch {
      toast.error("Couldn't start the email. Try again.");
      setOpening(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New email</h1>
        <p className="text-sm text-muted-foreground">
          Start from a template, or from a blank page in Contentor&apos;s brand.
        </p>
      </div>
      <PageState
        loading={!templates && !error}
        error={error}
        skeleton={<SkeletonCardGrid count={6} />}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => start("blank")}
            className="flex h-full min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            {opening === "blank" ? (
              <Spinner />
            ) : (
              <FilePlus2 className="h-6 w-6" />
            )}
            Blank email
          </button>
          {templates?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => start(t.id)}
              className="space-y-2 rounded-xl border p-3 text-left transition-colors hover:border-primary"
            >
              <TemplateThumb html={t.preview_html} title={t.name} />
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="truncate text-sm font-medium">{t.name}</span>
                {opening === t.id && <Spinner size="sm" />}
              </div>
            </button>
          ))}
        </div>
      </PageState>
    </div>
  );
}
