"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import {
  AnnouncementTemplate,
  deleteTemplate,
  listTemplates,
} from "@/lib/announcements";

export default function AnnouncementTemplatesList({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const [items, setItems] = useState<AnnouncementTemplate[]>([]);

  const load = () =>
    listTemplates()
      .then((all) => setItems(all.filter((t) => !t.builtin)))
      .catch(() => setItems([]));
  useEffect(() => {
    load();
  }, [refreshKey]);

  const remove = async (id: number) => {
    if (!confirm("Delete this template?")) return;
    try {
      await deleteTemplate(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (items.length === 0)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No saved templates yet. Use “Save as template” when composing.
      </p>
    );

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((t) => (
        <div key={t.id} className="flex items-center gap-3 p-3 text-sm">
          <div className="flex-1">
            <div className="font-medium">{t.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {t.title}
            </div>
          </div>
          <button
            onClick={() => remove(Number(t.id))}
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
