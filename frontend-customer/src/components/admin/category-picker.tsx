"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { clientFetch } from "@/lib/api-client"
import { Plus, X } from "lucide-react"
import type { CourseCategory } from "@/types/course"

interface CategoryPickerProps {
  /** Selected category ids. */
  value: number[]
  onChange: (ids: number[]) => void
}

/** Multi-select category picker with create-on-the-fly. Loads the tenant's
 *  categories, lets the coach toggle selection, and create a new category by
 *  typing a name that doesn't exist yet. */
export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const [all, setAll] = useState<CourseCategory[]>([])
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)

  const fetchCategories = useCallback(async () => {
    try {
      const data = await clientFetch<CourseCategory[]>("/api/v1/courses/categories/")
      setAll(data)
    } catch {
      // ignore — picker degrades to create-only
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const selected = useMemo(
    () => value.map((id) => all.find((c) => c.id === id)).filter(Boolean) as CourseCategory[],
    [value, all],
  )

  const q = query.trim().toLowerCase()
  const suggestions = all.filter(
    (c) => !value.includes(c.id) && (q === "" || c.name.toLowerCase().includes(q)),
  )
  const exactExists = all.some((c) => c.name.toLowerCase() === q)

  function add(id: number) {
    if (!value.includes(id)) onChange([...value, id])
    setQuery("")
  }

  function remove(id: number) {
    onChange(value.filter((v) => v !== id))
  }

  async function createAndAdd() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const created = await clientFetch<CourseCategory>("/api/v1/courses/categories/", {
        method: "POST",
        body: JSON.stringify({ name }),
      })
      setAll((prev) => [...prev, created])
      onChange([...value, created.id])
      setQuery("")
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1">
              {c.name}
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${c.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add a category…"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            if (q && !exactExists) createAndAdd()
            else if (suggestions.length === 1) add(suggestions[0].id)
          }
        }}
      />

      {(suggestions.length > 0 || (q !== "" && !exactExists)) && (
        <div className="rounded-md border bg-background p-1">
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => add(c.id)}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            >
              {c.name}
            </button>
          ))}
          {q !== "" && !exactExists && (
            <button
              type="button"
              onClick={createAndAdd}
              disabled={creating}
              className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Create “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
