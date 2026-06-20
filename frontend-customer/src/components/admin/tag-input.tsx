"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { clientFetch } from "@/lib/api-client"
import { Plus, X } from "lucide-react"
import type { Tag, TagScope } from "@/types/course"

interface TagInputProps {
  /** Selected tag ids for this entity. */
  value: number[]
  onChange: (ids: number[]) => void
  /** The content-type pool these tags belong to. */
  scope: TagScope
}

/** Free-text tag combobox: type to filter the pool's existing tags, Enter (or
 *  the "Create …" row) makes a new one on the fly, selected tags show as
 *  removable pills. Admin-only — used to organise/filter content. */
export function TagInput({ value, onChange, scope }: TagInputProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const fetchTags = useCallback(async () => {
    try {
      const data = await clientFetch<Tag[]>(`/api/v1/tags/?scope=${scope}`)
      setTags(data)
    } catch {
      // ignore — the coach can still create the first tag
    }
  }, [scope])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const selected = value.map((id) => byId.get(id)).filter(Boolean) as Tag[]

  const q = query.trim().toLowerCase()
  const suggestions = tags.filter(
    (t) => !value.includes(t.id) && (!q || t.name.toLowerCase().includes(q)),
  )
  const exactMatch = tags.find((t) => t.name.toLowerCase() === q)
  const canCreate = q.length > 0 && !exactMatch

  function select(id: number) {
    if (!value.includes(id)) onChange([...value, id])
    setQuery("")
    setOpen(false)
  }

  function remove(id: number) {
    onChange(value.filter((v) => v !== id))
  }

  async function createTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const tag = await clientFetch<Tag>("/api/v1/tags/", {
        method: "POST",
        body: JSON.stringify({ scope, name: trimmed }),
      })
      setTags((ts) => (ts.some((t) => t.id === tag.id) ? ts : [...ts, tag]))
      select(tag.id)
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  function onEnter() {
    if (exactMatch) select(exactMatch.id)
    else if (q) createTag(query)
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
            >
              {t.name}
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label={`Remove ${t.name} tag`}
                className="rounded-full transition-opacity hover:opacity-80"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Add a tag…"
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onEnter()
            }
            if (e.key === "Backspace" && !query && selected.length) {
              remove(selected[selected.length - 1].id)
            }
          }}
        />

        {open && (suggestions.length > 0 || canCreate) && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {suggestions.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(t.id)}
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {t.name}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => createTag(query)}
                disabled={busy}
                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Create &ldquo;{query.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
