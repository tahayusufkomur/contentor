"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteTemplate,
  listGallery,
  listTemplates,
  type EmailTemplate,
  type GalleryTemplate,
} from "@/lib/email-api";

export const dynamic = "force-dynamic";

function asArray<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results || [];
}

export default function TemplateLibraryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [gallery, setGallery] = useState<GalleryTemplate[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await listTemplates();
      setTemplates(asArray(data));
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGallery = useCallback(async () => {
    try {
      const data = await listGallery();
      setGallery(asArray(data));
    } catch {
      setGallery([]);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (showGallery) {
      fetchGallery();
    }
  }, [fetchGallery, showGallery]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this template?")) return;

    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((template) => template.id !== id));
    } catch {
      // ignore
    }
  }

  function handleEdit(templateId: string) {
    router.push(`/admin/email/compose?template=${encodeURIComponent(templateId)}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your email templates.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGallery((prev) => !prev)}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted/50"
          >
            {showGallery ? "My Templates" : "Browse Gallery"}
          </button>
          <Link
            href="/admin/email/compose"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            New Template
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading templates...</div>
      ) : showGallery ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Gallery Templates</h2>
          {gallery.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No gallery templates available.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map((template) => (
                <div
                  key={template.id}
                  className="rounded-lg border p-4 transition-shadow hover:shadow-md"
                >
                  <h3 className="text-sm font-medium">{template.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.category}
                    {template.is_premium ? " (Premium)" : ""}
                  </p>
                  <button
                    onClick={() => handleEdit(template.id)}
                    className="mt-3 text-xs text-primary hover:underline"
                  >
                    Use this template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border bg-muted/10 py-12 text-center">
          <p className="text-muted-foreground">No templates yet.</p>
          <button
            onClick={() => setShowGallery(true)}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Browse the gallery to get started
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border p-4 transition-shadow hover:shadow-md"
            >
              <h3 className="text-sm font-medium">{template.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(String(template.updated_at || template.created_at)).toLocaleDateString()}
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => handleEdit(template.id)}
                  className="text-xs text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
