"use client";

import { useCallback, useEffect, useState } from "react";
import { clientFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Tag as TagIcon } from "lucide-react";
import type { Tag, TagScope } from "@/types/course";

interface TagFilterBarProps {
  scope: TagScope;
  value: number[];
  onChange: (ids: number[]) => void;
}

/** A row of tag pills above an admin list. Toggling a tag narrows the list
 *  (the consuming page sends the selected ids as ?tags=). Renders nothing
 *  until the scope has at least one tag. */
export function TagFilterBar({ scope, value, onChange }: TagFilterBarProps) {
  const [tags, setTags] = useState<Tag[]>([]);

  const fetchTags = useCallback(async () => {
    try {
      setTags(await clientFetch<Tag[]>(`/api/v1/tags/?scope=${scope}`));
    } catch {
      // ignore — no tags yet
    }
  }, [scope]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  if (tags.length === 0) return null;

  function toggle(id: number) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <TagIcon className="h-3.5 w-3.5" /> Tags:
      </span>
      {tags.map((t) => {
        const active = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-accent",
            )}
          >
            {t.name}
          </button>
        );
      })}
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
