"use client"

import { useCallback, useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { clientFetch } from "@/lib/api-client"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FilterGroup, FilterOption } from "@/types/course"

interface FilterPickerProps {
  /** Selected FilterOption ids. */
  value: number[]
  onChange: (ids: number[]) => void
  /** Which filters to load — courses or events. */
  scope: "course" | "event"
}

/** Faceted picker: shows the coach's filters (each as a row of option pills),
 *  lets them toggle options and create a new option inline within a filter. */
export function FilterPicker({ value, onChange, scope }: FilterPickerProps) {
  const [groups, setGroups] = useState<FilterGroup[]>([])
  const [creatingFor, setCreatingFor] = useState<number | null>(null)
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchGroups = useCallback(async () => {
    try {
      const data = await clientFetch<FilterGroup[]>(
        `/api/v1/filters/groups/?applies_to=${scope}`,
      )
      setGroups(data)
    } catch {
      // ignore — picker simply shows the empty hint
    }
  }, [scope])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  async function createOption(groupId: number) {
    const name = newName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const opt = await clientFetch<FilterOption>("/api/v1/filters/options/", {
        method: "POST",
        body: JSON.stringify({ group: groupId, name }),
      })
      setGroups((gs) =>
        gs.map((g) => (g.id === groupId ? { ...g, options: [...g.options, opt] } : g)),
      )
      onChange([...value, opt.id])
      setNewName("")
      setCreatingFor(null)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  if (groups.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No filters yet. Create filters in the studio admin to tag this {scope}.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.id} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{g.name}</span>
            <button
              type="button"
              onClick={() => {
                setCreatingFor(creatingFor === g.id ? null : g.id)
                setNewName("")
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Option
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.options.length === 0 && (
              <span className="text-xs text-muted-foreground/70">No options yet.</span>
            )}
            {g.options.map((o) => {
              const active = value.includes(o.id)
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
              )
            })}
          </div>
          {creatingFor === g.id && (
            <div className="flex gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={`New ${g.name} option`}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    createOption(g.id)
                  }
                }}
              />
              <button
                type="button"
                onClick={() => createOption(g.id)}
                disabled={saving}
                className="shrink-0 rounded-md border px-2.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
