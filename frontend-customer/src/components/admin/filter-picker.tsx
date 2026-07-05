"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { clientFetch } from "@/lib/api-client";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterGroup, FilterOption } from "@/types/course";

interface FilterPickerProps {
  /** Selected FilterOption ids for this entity. */
  value: number[];
  onChange: (ids: number[]) => void;
  /** The element type these filters belong to (sets a new filter's scope). */
  scope: "course" | "event";
}

/** Inline filter manager shown on a course/event form. The coach can create a
 *  filter (scoped to this element type), add options to it, select which apply
 *  to this entity, and delete a filter — all without leaving the form. */
export function FilterPicker({ value, onChange, scope }: FilterPickerProps) {
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const data = await clientFetch<FilterGroup[]>(
        `/api/v1/filters/groups/?applies_to=${scope}`,
      );
      setGroups(data);
    } catch {
      // ignore — coach can still create the first filter
    }
  }, [scope]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  function toggle(id: number) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  }

  async function createGroup() {
    const name = newGroupName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const g = await clientFetch<FilterGroup>("/api/v1/filters/groups/", {
        method: "POST",
        body: JSON.stringify({ name, applies_to: scope }),
      });
      setGroups((gs) => [...gs, { ...g, options: g.options ?? [] }]);
      setNewGroupName("");
      setAddingGroup(false);
      setCreatingFor(g.id);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(group: FilterGroup) {
    if (
      !window.confirm(
        `Delete the "${group.name}" filter and all its options? It will be removed from every ${scope}.`,
      )
    )
      return;
    try {
      await clientFetch(`/api/v1/filters/groups/${group.id}/`, {
        method: "DELETE",
      });
      const removedIds = new Set(group.options.map((o) => o.id));
      setGroups((gs) => gs.filter((g) => g.id !== group.id));
      onChange(value.filter((id) => !removedIds.has(id)));
    } catch {
      // ignore
    }
  }

  async function createOption(groupId: number) {
    const name = newOptionName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const opt = await clientFetch<FilterOption>("/api/v1/filters/options/", {
        method: "POST",
        body: JSON.stringify({ group: groupId, name }),
      });
      setGroups((gs) =>
        gs.map((g) =>
          g.id === groupId ? { ...g, options: [...g.options, opt] } : g,
        ),
      );
      onChange([...value, opt.id]);
      setNewOptionName("");
      setCreatingFor(null);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div
          key={g.id}
          className="space-y-1.5 rounded-md border bg-background p-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{g.name}</span>
            <div className="flex items-center gap-2 text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setCreatingFor(creatingFor === g.id ? null : g.id);
                  setNewOptionName("");
                }}
                className="flex items-center gap-1 text-xs transition-colors hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Option
              </button>
              <button
                type="button"
                onClick={() => deleteGroup(g)}
                aria-label={`Delete ${g.name} filter`}
                className="rounded p-0.5 transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.options.length === 0 && (
              <span className="text-xs text-muted-foreground/70">
                No options yet — add one.
              </span>
            )}
            {g.options.map((o) => {
              const active = value.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-accent",
                  )}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
          {creatingFor === g.id && (
            <div className="flex gap-1.5">
              <Input
                value={newOptionName}
                onChange={(e) => setNewOptionName(e.target.value)}
                placeholder={`New ${g.name} option`}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createOption(g.id);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => createOption(g.id)}
                disabled={busy}
                className="shrink-0 rounded-md border px-2.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      ))}

      {addingGroup ? (
        <div className="flex gap-1.5">
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New filter name (e.g. Level)"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createGroup();
              }
              if (e.key === "Escape") {
                setAddingGroup(false);
                setNewGroupName("");
              }
            }}
          />
          <button
            type="button"
            onClick={createGroup}
            disabled={busy}
            className="shrink-0 rounded-md border px-2.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingGroup(true)}
          className="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New filter
        </button>
      )}
    </div>
  );
}
