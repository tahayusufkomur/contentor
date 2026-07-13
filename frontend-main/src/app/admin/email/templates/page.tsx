"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { TemplateGrid } from "@shared/email/template-grid";
import {
  deleteTemplate,
  getTemplate,
  listGallery,
  listTemplates,
  previewTemplates,
  type EmailTemplate,
} from "@/lib/platform-email-api";

export const dynamic = "force-dynamic";

type Tab = "mine" | "gallery";

function asArray<T>(data: T[] | { results: T[] } | { data: T[] }): T[] {
  if (Array.isArray(data)) return data;
  if ("results" in data && Array.isArray(data.results)) return data.results;
  if ("data" in data && Array.isArray((data as { data: T[] }).data))
    return (data as { data: T[] }).data;
  return [];
}

export default function TemplatesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mine");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [gallery, setGallery] = useState<EmailTemplate[]>([]);
  const [previewHtmlMap, setPreviewHtmlMap] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPreviews = useCallback(async (tmpls: EmailTemplate[]) => {
    const ids = tmpls.map((t) => t.id).filter(Boolean);
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      try {
        const result = await previewTemplates(batch);
        setPreviewHtmlMap((prev) => ({ ...prev, ...result.previews }));
      } catch {
        // partial failure is fine
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    listTemplates()
      .then((data) => {
        const tmpls = asArray(data);
        setTemplates(tmpls);
        fetchPreviews(tmpls);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchPreviews]);

  useEffect(() => {
    if (tab !== "gallery" || galleryLoaded) return;
    listGallery()
      .then((data) => {
        const g = asArray(data) as unknown as EmailTemplate[];
        setGallery(g);
        setGalleryLoaded(true);
        fetchPreviews(g);
      })
      .catch(() => {});
  }, [tab, galleryLoaded, fetchPreviews]);

  const handlePreview = useCallback(
    async (template: EmailTemplate) => {
      setPreviewOpen(true);
      setPreviewTitle(template.name);
      setPreviewHtml("");
      setPreviewLoading(true);

      if (previewHtmlMap[template.id]) {
        setPreviewHtml(previewHtmlMap[template.id]);
        setPreviewLoading(false);
        return;
      }

      try {
        const detail = await getTemplate(template.id);
        const html =
          ((detail as Record<string, unknown>).html as string) ||
          ((detail as Record<string, unknown>).rendered_html as string) ||
          "";
        if (html) {
          setPreviewHtml(html);
        } else {
          const result = await previewTemplates([template.id]);
          setPreviewHtml(result.previews[template.id] || "");
        }
      } catch {
        setPreviewHtml("");
      } finally {
        setPreviewLoading(false);
      }
    },
    [previewHtmlMap],
  );

  const handleDelete = useCallback(async (template: EmailTemplate) => {
    if (!window.confirm(`Delete "${template.name}"?`)) return;
    try {
      await deleteTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } catch {
      // ignore
    }
  }, []);

  const handleEdit = useCallback(
    (template: EmailTemplate) => {
      router.push(`/admin/email/compose?template=${template.id}`);
    },
    [router],
  );

  const currentTemplates = tab === "mine" ? templates : gallery;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-sm text-muted-foreground">
            Manage your platform email templates.
          </p>
        </div>
        <Link
          href="/admin/email/compose"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          New Email
        </Link>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("mine")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "mine"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          My Templates
        </button>
        <button
          onClick={() => setTab("gallery")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "gallery"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          Gallery
        </button>
      </div>

      {loading && tab === "mine" ? (
        <p className="text-sm text-muted-foreground">Loading templates...</p>
      ) : (
        <TemplateGrid
          templates={currentTemplates}
          previewHtmlMap={previewHtmlMap}
          mode="library"
          onEdit={handleEdit}
          onDelete={tab === "mine" ? handleDelete : undefined}
          onPreview={handlePreview}
        />
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative mx-4 w-full max-w-3xl rounded-lg bg-background p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{previewTitle}</h3>
              <button
                onClick={() => setPreviewOpen(false)}
                className="rounded-md px-2 py-1 text-sm hover:bg-muted"
              >
                Close
              </button>
            </div>
            {previewLoading ? (
              <div className="flex h-[60vh] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Loading preview...
                </p>
              </div>
            ) : previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                sandbox=""
                className="h-[75vh] w-full rounded border"
                title="Template preview"
              />
            ) : (
              <div className="flex h-[60vh] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Preview not available.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
