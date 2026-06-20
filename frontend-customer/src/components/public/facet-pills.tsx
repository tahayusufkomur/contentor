'use client'

import { cn } from '@/lib/utils'
import type { FilterOption } from '@/types/course'

export interface FacetItem {
  filter_options?: FilterOption[]
}

/** groupId -> selected option ids. */
export type FacetSelection = Record<number, number[]>

export interface Facet {
  id: number
  name: string
  options: { id: number; name: string }[]
}

/** Build the facet rows present among `items`, limited to `groupIds` (in that
 *  order) when the coach has chosen specific facets; empty `groupIds` → no
 *  facets (the coach opts in per block). */
export function buildFacets(items: FacetItem[], groupIds: number[]): Facet[] {
  if (!groupIds.length) return []
  const groups = new Map<number, { name: string; options: Map<number, string> }>()
  for (const it of items) {
    for (const o of it.filter_options ?? []) {
      if (!groupIds.includes(o.group)) continue
      if (!groups.has(o.group)) groups.set(o.group, { name: o.group_name, options: new Map() })
      groups.get(o.group)!.options.set(o.id, o.name)
    }
  }
  return groupIds
    .filter((id) => groups.has(id))
    .map((id) => {
      const g = groups.get(id)!
      return {
        id,
        name: g.name,
        options: Array.from(g.options, ([oid, name]) => ({ id: oid, name })),
      }
    })
}

/** Within a facet, selected options OR; across facets, AND. */
export function matchesFacets(item: FacetItem, selected: FacetSelection): boolean {
  for (const [groupId, optIds] of Object.entries(selected)) {
    if (!optIds.length) continue
    const gid = Number(groupId)
    const ok = (item.filter_options ?? []).some((o) => o.group === gid && optIds.includes(o.id))
    if (!ok) return false
  }
  return true
}

export function FacetPills({
  facets,
  selected,
  onChange,
}: {
  facets: Facet[]
  selected: FacetSelection
  onChange: (s: FacetSelection) => void
}) {
  if (!facets.length) return null

  function toggle(groupId: number, optId: number) {
    const cur = selected[groupId] ?? []
    const next = cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId]
    onChange({ ...selected, [groupId]: next })
  }

  return (
    <div className="space-y-2">
      {facets.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{f.name}:</span>
          {f.options.map((o) => {
            const active = (selected[f.id] ?? []).includes(o.id)
            return (
              <button
                key={o.id}
                onClick={() => toggle(f.id, o.id)}
                className={cn(
                  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-accent',
                )}
              >
                {o.name}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
