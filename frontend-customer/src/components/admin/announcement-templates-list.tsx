"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
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
      .catch(() => {
        setItems([]);
        toast.error("Couldn't load templates.");
      });
  useEffect(() => {
    load();
  }, [refreshKey]);

  if (items.length === 0)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No saved templates yet. Use “Save as template” when composing.
      </p>
    );

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((t) => (
        <TemplateRow key={t.id} item={t} onRemoved={load} />
      ))}
    </div>
  );
}

function TemplateRow({
  item,
  onRemoved,
}: {
  item: AnnouncementTemplate;
  onRemoved: () => void;
}) {
  const { run: remove, loading: removing } = useAsyncAction(
    async () => {
      if (!confirm("Delete this template?")) return;
      await deleteTemplate(Number(item.id));
      toast.success("Deleted");
      onRemoved();
    },
    { errorToast: "Failed to delete" },
  );

  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <div className="flex-1">
        <div className="font-medium">{item.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {item.title}
        </div>
      </div>
      <button
        onClick={remove}
        disabled={removing}
        className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        {removing ? <Spinner size="sm" /> : "Delete"}
      </button>
    </div>
  );
}
