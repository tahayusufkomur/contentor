'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ShoppingCart, Package, BookOpen, Download, Radio, Tv, Tag, Lock, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { PriceBadge } from '@/components/billing/price-badge'
import { clientFetch } from '@/lib/api-client'
import { ApiError } from '@/types/api'
import { addToCart } from '@/lib/cart'
import type { StoreItem, SubscriptionPlan } from '@/types/billing'

type FilterType = 'all' | 'course' | 'download' | 'live_class' | 'live_stream' | 'bundle'

const TYPE_LABELS: Record<string, string> = {
  course: 'Course',
  download: 'Download',
  live_class: 'Live Class',
  live_stream: 'Live Stream',
  bundle: 'Bundle',
}

const FILTER_BUTTONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'course', label: 'Courses' },
  { value: 'download', label: 'Downloads' },
  { value: 'live_class', label: 'Live Classes' },
  { value: 'live_stream', label: 'Live Streams' },
  { value: 'bundle', label: 'Bundles' },
]

function StoreCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-44 w-full" />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  )
}

function getContentType(type: string): string {
  const map: Record<string, string> = {
    course: 'course',
    download: 'download',
    live_class: 'live_class',
    live_stream: 'live_stream',
    bundle: 'bundle',
  }
  return map[type] ?? type
}

export default function StorePage() {
  const router = useRouter()
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [addingIds, setAddingIds] = useState<Set<number>>(new Set())
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [subscribingPlanId, setSubscribingPlanId] = useState<number | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('type', filter)
      if (search) params.set('search', search)
      const query = params.toString()
      const url = `/api/v1/billing/store/${query ? `?${query}` : ''}`
      const data = await clientFetch<StoreItem[]>(url)
      setItems(data)
    } catch {
      toast.error('Failed to load store items')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    clientFetch<SubscriptionPlan[]>('/api/v1/billing/plans/')
      .then(setPlans)
      .catch(() => {})
  }, [])

  const handleSubscribe = async (planId: number) => {
    setSubscribingPlanId(planId)
    try {
      await clientFetch('/api/v1/billing/subscribe/', {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId }),
      })
      toast.success('Subscribed! You now have access to plan content.')
      router.refresh()
      fetchItems()
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.push('/login?toast=You+need+to+log+in+to+subscribe&toast_type=info')
        return
      }
      if (err instanceof ApiError && err.status === 400) {
        toast.info("You're already subscribed to this plan")
        return
      }
      const message = err instanceof Error ? err.message : 'Subscription failed.'
      toast.error(message)
    } finally {
      setSubscribingPlanId(null)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const handleAddToCart = (item: StoreItem) => {
    setAddingIds((prev) => new Set(prev).add(item.id))
    addToCart({
      content_type: getContentType(item.type),
      object_id: item.id,
      title: item.title,
      price: item.price,
      type: item.type,
    })
    toast.success(`"${item.title}" added to cart`)
    setAddingIds((prev) => {
      const next = new Set(prev)
      next.delete(item.id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Store</h1>
        <p className="mt-1 text-muted-foreground">
          Browse courses, downloads, live classes, and bundles.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <Input
          placeholder="Search items..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="icon">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {FILTER_BUTTONS.map(({ value, label }) => (
          <Button
            key={value}
            variant={filter === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Subscription Plans */}
      {plans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Subscription Plans</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id}>
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.description && (
                    <CardDescription>{plan.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold tabular-nums">
                    {plan.price} TL<span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                  <Button
                    className="w-full gap-2"
                    disabled={subscribingPlanId === plan.id}
                    onClick={() => handleSubscribe(plan.id)}
                  >
                    {subscribingPlanId === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    Subscribe
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StoreCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No items found"
          description="Try adjusting your search or filter to find what you're looking for."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <StoreItemCard
              key={item.id}
              item={item}
              adding={addingIds.has(item.id)}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface StoreItemCardProps {
  item: StoreItem
  adding: boolean
  onAddToCart: (item: StoreItem) => void
}

function StoreItemCard({ item, adding, onAddToCart }: StoreItemCardProps) {
  const isOwned = item.access_info?.has_access
  const isBundle = item.type === 'bundle'

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 flex flex-col">
      {/* Thumbnail */}
      {item.thumbnail_url ? (
        <div className="relative overflow-hidden">
          <img
            src={item.thumbnail_url}
            alt={item.title}
            className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
          <span className="text-5xl font-bold text-primary/30">
            {item.title.charAt(0)}
          </span>
        </div>
      )}

      <CardContent className="p-4 space-y-3 flex flex-col flex-1">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {TYPE_LABELS[item.type] ?? item.type}
          </Badge>
          {isOwned && (
            <Badge variant="success" className="text-xs">
              Owned
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold leading-snug line-clamp-2">{item.title}</h3>

        {/* Bundle extras */}
        {isBundle && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            <span>{item.item_count} items</span>
            {item.original_price && (
              <span className="line-through ml-1">{item.original_price} TL</span>
            )}
          </div>
        )}

        {/* Price badge */}
        <PriceBadge accessInfo={item.access_info} price={item.price} />

        {/* Action */}
        <div className="mt-auto pt-1">
          {isOwned ? null : (
            <Button
              size="sm"
              className="w-full gap-2"
              disabled={adding}
              onClick={() => onAddToCart(item)}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Add to Cart — {item.price} TL
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
