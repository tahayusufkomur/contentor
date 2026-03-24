'use client'

import { useEffect, useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { clientFetch } from '@/lib/api-client'

export interface SelectedItem {
  content_type: string
  object_id: number
  title: string
  price: string
}

interface Product {
  id: number
  title: string
  type: string
  price: string
  content_type?: string
}

const TYPE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Course', value: 'course' },
  { label: 'Download', value: 'download' },
  { label: 'Live Class', value: 'live_class' },
  { label: 'Live Stream', value: 'live_stream' },
]

const TYPE_LABEL_MAP: Record<string, string> = {
  course: 'Course',
  download: 'Download',
  live_class: 'Live Class',
  live_stream: 'Live Stream',
}

const TYPE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'brand'> = {
  course: 'brand',
  download: 'secondary',
  live_class: 'warning',
  live_stream: 'success',
}

interface ContentPickerProps {
  selected: SelectedItem[]
  onChange: (items: SelectedItem[]) => void
}

export function ContentPicker({ selected, onChange }: ContentPickerProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    clientFetch<Product[]>('/api/v1/billing/products/')
      .then((data) => {
        // Filter out bundles
        setProducts(data.filter((p) => p.type !== 'bundle'))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesType = typeFilter === 'all' || p.type === typeFilter
      const matchesSearch = search === '' || p.title.toLowerCase().includes(search.toLowerCase())
      return matchesType && matchesSearch
    })
  }, [products, typeFilter, search])

  function isSelected(product: Product) {
    return selected.some((s) => s.content_type === product.type && s.object_id === product.id)
  }

  function toggle(product: Product) {
    if (isSelected(product)) {
      onChange(selected.filter((s) => !(s.content_type === product.type && s.object_id === product.id)))
    } else {
      onChange([
        ...selected,
        {
          content_type: product.content_type ?? product.type,
          object_id: product.id,
          title: product.title,
          price: product.price,
        },
      ])
    }
  }

  function removeSelected(item: SelectedItem) {
    onChange(selected.filter((s) => !(s.content_type === item.content_type && s.object_id === item.object_id)))
  }

  return (
    <div className="space-y-3">
      {/* Selected items */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-md border p-3 bg-muted/30">
          {selected.map((item) => (
            <span
              key={`${item.content_type}-${item.object_id}`}
              className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium"
            >
              {item.title}
              <button
                type="button"
                onClick={() => removeSelected(item)}
                className="ml-1 rounded-full hover:text-destructive focus:outline-none"
                aria-label={`Remove ${item.title}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search and filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={typeFilter === f.value ? 'default' : 'outline'}
              onClick={() => setTypeFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-4 w-4 rounded-sm" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            No content found.
          </p>
        ) : (
          filtered.map((product) => {
            const checked = isSelected(product)
            return (
              <label
                key={`${product.type}-${product.id}`}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(product)}
                  id={`product-${product.type}-${product.id}`}
                />
                <span className="flex-1 text-sm font-medium">{product.title}</span>
                <Badge variant={TYPE_BADGE_VARIANT[product.type] ?? 'outline'}>
                  {TYPE_LABEL_MAP[product.type] ?? product.type}
                </Badge>
                <span className="text-sm text-muted-foreground whitespace-nowrap">${product.price}</span>
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}
