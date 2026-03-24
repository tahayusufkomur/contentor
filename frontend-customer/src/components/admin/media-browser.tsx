"use client"

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchPageParams {
  offset: number
  limit: number
  ordering: string
  search: string
}

export interface FetchPageResult<T> {
  results: T[]
  next: string | null
  /** Total count of items matching the query (for "select all from DB"). */
  count?: number
}

export interface BulkSelection {
  /** "ids" = specific items selected; "all" = every item matching current filters */
  mode: "ids" | "all"
  /** Selected IDs (all loaded IDs when mode is "all"). */
  ids: (string | number)[]
  /** Total count of items matching current query. */
  totalCount: number
  /** Current search filter. */
  search: string
  /** Current ordering. */
  ordering: string
}

export interface BulkAction {
  label: string
  icon?: LucideIcon
  variant?: "default" | "destructive"
  onAction: (selection: BulkSelection) => Promise<void> | void
}

export interface MediaBrowserProps<T> {
  fetchPage: (params: FetchPageParams) => Promise<FetchPageResult<T>>
  renderGalleryItem?: (item: T, selected: boolean) => ReactNode
  renderListRow: (item: T) => ReactNode
  listColumns: { label: string; key: string }[]
  emptyIcon: LucideIcon
  emptyMessage: string
  sortOptions: { label: string; value: string }[]
  defaultSort?: string
  /** Enable gallery view toggle. Default true. */
  galleryEnabled?: boolean
  /** Return a unique ID for each item to enable selection. */
  getItemId?: (item: T) => string | number
  /** Bulk actions shown when items are selected. */
  actions?: BulkAction[]
  /** Shorthand: provide a delete handler and a "Delete" action is added automatically. */
  onDelete?: (selection: BulkSelection) => Promise<void> | void
  /** When provided, persists sort, view, cell size, and search to localStorage under this key. */
  persistKey?: string
  /** Render an expanded row (e.g. inline edit panel) below a list item. Return null to hide. */
  renderExpandedRow?: (item: T) => ReactNode | null
}

export interface MediaBrowserHandle {
  refresh: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type CellSize = "sm" | "md" | "lg"

const CELL_GRID: Record<CellSize, string> = {
  sm: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
  md: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  lg: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
}

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MediaBrowserInner<T>(
  {
    fetchPage,
    renderGalleryItem,
    renderListRow,
    listColumns,
    emptyIcon: EmptyIcon,
    emptyMessage,
    sortOptions,
    defaultSort = "-created_at",
    galleryEnabled = true,
    getItemId,
    actions: externalActions,
    onDelete,
    persistKey,
    renderExpandedRow,
  }: MediaBrowserProps<T>,
  ref: React.ForwardedRef<MediaBrowserHandle>
) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState("")
  const [ordering, setOrdering] = useState(defaultSort)
  const [view, setView] = useState<"gallery" | "list">(
    galleryEnabled ? "gallery" : "list"
  )
  const [cellSize, setCellSize] = useState<CellSize>("md")
  const [restored, setRestored] = useState(!persistKey)
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(
    new Set()
  )
  const [selectAllMode, setSelectAllMode] = useState(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [fadingIds, setFadingIds] = useState<Set<string | number>>(new Set())
  const offsetRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const hasLoadedOnce = useRef(false)
  const isFirstRender = useRef(true)

  const selectable = !!getItemId

  // Build actions list
  const allActions: BulkAction[] = []
  if (externalActions) allActions.push(...externalActions)
  if (onDelete && !allActions.some((a) => a.label === "Delete")) {
    allActions.push({
      label: "Delete",
      icon: Trash2,
      variant: "destructive",
      onAction: onDelete,
    })
  }

  // ---- selection helpers ----

  const toggleSelect = useCallback(
    (id: string | number) => {
      setSelectAllMode(false)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    []
  )

  const selectAllVisible = useCallback(() => {
    if (!getItemId) return
    const allIds = items.map(getItemId)
    const allVisibleSelected =
      allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
    if (allVisibleSelected) {
      setSelectedIds(new Set())
      setSelectAllMode(false)
    } else {
      setSelectedIds(new Set(allIds))
    }
  }, [items, getItemId, selectedIds])

  const activateSelectAll = useCallback(() => {
    if (!getItemId) return
    setSelectAllMode(true)
    setSelectedIds(new Set(items.map(getItemId)))
  }, [items, getItemId])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setSelectAllMode(false)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl+A
  useEffect(() => {
    if (!selectable) return
    const container = containerRef.current
    if (!container) return

    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "a" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        selectAllVisible()
      }
    }

    container.addEventListener("keydown", handleKeyDown)
    return () => container.removeEventListener("keydown", handleKeyDown)
  }, [selectable, selectAllVisible])

  // ---- data fetching ----

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) {
        offsetRef.current = 0
        // Only show skeleton loading on the very first load
        if (!hasLoadedOnce.current) {
          setLoading(true)
        }
        clearSelection()
      } else {
        setLoadingMore(true)
      }

      try {
        const res = await fetchPage({
          offset: offsetRef.current,
          limit: PAGE_SIZE,
          ordering,
          search,
        })

        if (reset) {
          setItems(res.results)
          setTotalCount(res.count ?? res.results.length)
        } else {
          setItems((prev) => [...prev, ...res.results])
          // For non-paginated APIs that return everything, keep totalCount in sync
          if (res.count !== undefined) {
            setTotalCount(res.count)
          }
        }
        setHasMore(res.next !== null)
        offsetRef.current += res.results.length
        hasLoadedOnce.current = true
      } catch {
        // ignore
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [fetchPage, ordering, search, clearSelection]
  )

  // Restore persisted preferences from localStorage on mount (useLayoutEffect runs before paint)
  useLayoutEffect(() => {
    if (!persistKey) return
    try {
      const data = JSON.parse(localStorage.getItem(`mb:${persistKey}`) || "{}")
      if (data.ordering) setOrdering(data.ordering)
      if (data.view && galleryEnabled) setView(data.view)
      if (data.cellSize) setCellSize(data.cellSize)
      if (data.search !== undefined) setSearch(data.search)
    } catch {
      // ignore
    }
    setRestored(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // initial load + reset on ordering change (waits for restore)
  useEffect(() => {
    if (!restored) return
    load(true)
  }, [restored, ordering]) // eslint-disable-line react-hooks/exhaustive-deps

  // debounced search (skip initial mount — ordering effect handles the first load)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => load(true), 300)
    return () => clearTimeout(searchTimerRef.current)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  // persist preferences to localStorage (skip until restored to avoid writing defaults)
  useEffect(() => {
    if (!persistKey || !restored) return
    try {
      localStorage.setItem(
        `mb:${persistKey}`,
        JSON.stringify({ ordering, view, cellSize, search })
      )
    } catch {
      // ignore quota errors
    }
  }, [persistKey, restored, ordering, view, cellSize, search])

  // infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          load(false)
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, load])

  // expose refresh to parent
  useImperativeHandle(ref, () => ({
    refresh: () => load(true),
  }))

  // ---- derived state ----

  const allItemIds = getItemId ? items.map(getItemId) : []
  const allVisibleSelected =
    selectable &&
    items.length > 0 &&
    allItemIds.every((id) => selectedIds.has(id))
  const someSelected = selectable && selectedIds.size > 0
  const indeterminate = someSelected && !allVisibleSelected

  const effectiveTotalCount = totalCount ?? items.length
  const hasMoreInDb = effectiveTotalCount > items.length
  const showSelectAllFromDb =
    allVisibleSelected && hasMoreInDb && !selectAllMode

  const displayCount = selectAllMode ? effectiveTotalCount : selectedIds.size

  // ---- action handler ----

  async function handleAction(action: BulkAction) {
    setActionLoading(true)
    try {
      const ids = Array.from(selectedIds)
      // Fade out selected items
      setFadingIds(new Set(ids))

      const selection: BulkSelection = {
        mode: selectAllMode ? "all" : "ids",
        ids,
        totalCount: effectiveTotalCount,
        search,
        ordering,
      }
      // Small delay so fade animation is visible
      await new Promise((r) => setTimeout(r, 300))
      await action.onAction(selection)
      clearSelection()
      setFadingIds(new Set())
    } finally {
      setActionLoading(false)
    }
  }

  // ---- render ----

  const selectionBar = someSelected && allActions.length > 0 && (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/50 px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">
          {selectAllMode
            ? `All ${effectiveTotalCount} items selected`
            : `${displayCount} selected`}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={actionLoading}
            >
              {actionLoading ? "Processing..." : "Actions"}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {allActions.map((action) => {
              const Icon = action.icon
              return (
                <DropdownMenuItem
                  key={action.label}
                  onClick={() => handleAction(action)}
                  className={
                    action.variant === "destructive"
                      ? "text-destructive focus:text-destructive"
                      : ""
                  }
                >
                  {Icon && <Icon className="mr-2 h-4 w-4" />}
                  {action.label}
                  {selectAllMode && (
                    <span className="ml-1 text-xs opacity-70">
                      ({effectiveTotalCount})
                    </span>
                  )}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          className="ml-auto text-xs"
          disabled={actionLoading}
        >
          Clear selection
        </Button>
      </div>
      {showSelectAllFromDb && (
        <div className="text-sm text-muted-foreground">
          All {items.length} items on this page are selected.{" "}
          <button
            type="button"
            onClick={activateSelectAll}
            className="font-medium text-primary hover:underline"
          >
            Select all {effectiveTotalCount} items
          </button>
        </div>
      )}
    </div>
  )

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 flex-1">
        {selectable && items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={selectAllVisible}
            className="text-xs shrink-0"
          >
            {allVisibleSelected ? "Deselect all" : "Select all"}
          </Button>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={ordering} onValueChange={setOrdering}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {galleryEnabled && view === "gallery" && (
          <div className="flex rounded-md border">
            {(["sm", "md", "lg"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setCellSize(size)}
                className={cn(
                  "px-2 py-1.5 text-xs font-medium uppercase transition-colors",
                  cellSize === size
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {size === "sm" ? "S" : size === "md" ? "M" : "L"}
              </button>
            ))}
          </div>
        )}

        {galleryEnabled && (
          <div className="flex rounded-md border">
            <button
              type="button"
              onClick={() => setView("gallery")}
              className={cn(
                "p-1.5 transition-colors",
                view === "gallery"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "p-1.5 transition-colors",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-4" ref={containerRef} tabIndex={-1}>
        {toolbar}
        {view === "gallery" && galleryEnabled ? (
          <div className={cn("grid gap-4", CELL_GRID[cellSize])}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4" ref={containerRef} tabIndex={-1}>
        {toolbar}
        <div className="rounded-xl border border-dashed bg-brand-surface p-12 text-center">
          <EmptyIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-2 text-muted-foreground">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" ref={containerRef} tabIndex={-1}>
      {toolbar}
      {selectionBar}

      {view === "gallery" && galleryEnabled ? (
        <div className={cn("grid gap-4", CELL_GRID[cellSize])}>
          {items.map((item, i) => {
            const id = getItemId?.(item)
            const isSelected =
              selectAllMode || (id !== undefined && selectedIds.has(id))
            const isFading = id !== undefined && fadingIds.has(id)
            return (
              <div
                key={id ?? i}
                className={cn(
                  "relative transition-all duration-300",
                  isFading && "scale-95 opacity-0"
                )}
              >
                {selectable && id !== undefined && (
                  <div className="absolute left-2 top-2 z-10">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(id)}
                      className="h-5 w-5 border-2 bg-background/80 backdrop-blur-sm"
                    />
                  </div>
                )}
                <div
                  className={cn(
                    isSelected && "ring-2 ring-primary rounded-lg"
                  )}
                >
                  {renderGalleryItem
                    ? renderGalleryItem(item, isSelected)
                    : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        selectAllMode
                          ? true
                          : indeterminate
                            ? "indeterminate"
                            : allVisibleSelected
                      }
                      onCheckedChange={selectAllVisible}
                    />
                  </TableHead>
                )}
                {listColumns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => {
                const id = getItemId?.(item)
                const isSelected =
                  selectAllMode || (id !== undefined && selectedIds.has(id))
                const isFading = id !== undefined && fadingIds.has(id)
                return (
                  <Fragment key={id ?? i}>
                    <TableRow
                      className={cn(
                        "transition-all duration-300",
                        isSelected && "bg-muted/50",
                        isFading && "opacity-0 scale-y-0 h-0"
                      )}
                    >
                      {selectable && id !== undefined && (
                        <td className="px-4 py-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(id)}
                          />
                        </td>
                      )}
                      {renderListRow(item)}
                    </TableRow>
                    {renderExpandedRow?.(item)}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  )
}

export const MediaBrowser = forwardRef(MediaBrowserInner) as <T>(
  props: MediaBrowserProps<T> & { ref?: React.Ref<MediaBrowserHandle> }
) => ReactNode
