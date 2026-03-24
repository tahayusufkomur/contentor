'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Play,
  Square,
  Radio,
  Clock,
  CheckCircle2,
  Video,
  ExternalLink,
  MapPin,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TableCell, TableRow } from '@/components/ui/table'
import { clientFetch, batchedAsync } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from '@/components/admin/media-browser'
import { InlineEditPanel, type FieldConfig } from '@/components/admin/inline-edit-panel'

// ─── Shared types & config ─────────────────────────────────────────

interface LiveItem {
  id: number
  title: string
  description: string
  status: string
  pricing_type: string
  price: string
  created_at: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
}

interface LiveClass extends LiveItem {
  room_name: string
}

interface LiveStream extends LiveItem {
  room_name: string
}

interface ZoomClass extends LiveItem {
  zoom_link: string
  zoom_meeting_id: string
}

interface OnsiteEvent extends LiveItem {
  location: string
  address: string
  max_capacity: number | null
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: <Clock className="h-3 w-3" /> },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <Clock className="h-3 w-3" /> },
  live: { label: 'Live', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <Radio className="h-3 w-3 animate-pulse" /> },
  ongoing: { label: 'Ongoing', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <Radio className="h-3 w-3 animate-pulse" /> },
  ended: { label: 'Ended', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 className="h-3 w-3" /> },
}

const SORT_OPTIONS = [
  { label: 'Newest', value: '-created_at' },
  { label: 'Oldest', value: 'created_at' },
  { label: 'Name A-Z', value: 'title' },
  { label: 'Name Z-A', value: '-title' },
]

const selectClasses = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm'

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.draft
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </div>
  )
}

function PricingBadge({ pricingType, price }: { pricingType: string; price: string }) {
  if (pricingType === 'free') {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Free
      </span>
    )
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      ${parseFloat(price).toFixed(0)}
    </span>
  )
}

interface PaginatedResponse<T> {
  results: T[]
  next: string | null
  count: number
}

async function fetchAdminListPage<T>(path: string, params: FetchPageParams): Promise<FetchPageResult<T>> {
  const sp = new URLSearchParams()
  sp.set('limit', String(params.limit))
  sp.set('offset', String(params.offset))
  sp.set('ordering', params.ordering)
  if (params.search) sp.set('search', params.search)

  const data = await clientFetch<PaginatedResponse<T> | T[]>(`${path}?${sp.toString()}`)
  if (Array.isArray(data)) {
    return { results: data, next: null, count: data.length }
  }
  return { results: data.results, next: data.next, count: data.count }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Live Classes Tab ──────────────────────────────────────────────

const liveClassFields: FieldConfig<LiveClass>[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'pricing_type', label: 'Access', type: 'select', options: [{ label: 'Free', value: 'free' }, { label: 'Paid', value: 'paid' }] },
  { key: 'price', label: 'Price', type: 'number', placeholder: '0.00', showWhen: (v) => v.pricing_type === 'paid' },
  { key: 'scheduled_at', label: 'Scheduled Date', type: 'datetime' },
]

function LiveClassesTab() {
  const router = useRouter()
  const browserRef = useRef<MediaBrowserHandle>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pricingType, setPricingType] = useState('free')
  const [price, setPrice] = useState('')
  const [autoRecording, setAutoRecording] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')

  const fetchPage = useCallback(async (params: FetchPageParams): Promise<FetchPageResult<LiveClass>> => {
    return fetchAdminListPage<LiveClass>('/api/v1/live/', params)
  }, [])

  function resetForm() { setTitle(''); setDescription(''); setPricingType('free'); setPrice(''); setAutoRecording(false); setScheduledAt('') }
  function openCreate() { resetForm(); setShowForm(true) }

  async function handleSave() {
    setSaving(true)
    try {
      const body = JSON.stringify({
        title, description, pricing_type: pricingType, auto_recording: autoRecording,
        ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
        ...(pricingType !== 'free' && price ? { price: parseFloat(price) } : {}),
      })
      await clientFetch('/api/v1/live/', { method: 'POST', body })
      toast.success('Live class created')
      resetForm(); setShowForm(false); browserRef.current?.refresh()
    } catch { toast.error('Failed to create live class') } finally { setSaving(false) }
  }

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await clientFetch(`/api/v1/live/${editingId}/`, {
        method: 'PUT',
        body: JSON.stringify({
          title: values.title, description: values.description, pricing_type: values.pricing_type,
          ...(values.scheduled_at ? { scheduled_at: new Date(values.scheduled_at as string).toISOString() } : {}),
          ...(values.pricing_type === 'paid' && values.price ? { price: parseFloat(values.price as string) } : {}),
        }),
      })
      toast.success('Live class updated')
      setEditingId(null); browserRef.current?.refresh()
    } catch { toast.error('Failed to update live class') } finally { setSaving(false) }
  }

  async function handleStart(id: number) {
    try { await clientFetch(`/api/v1/live/${id}/start/`, { method: 'POST' }); router.push(`/live/${id}`) } catch { toast.error('Failed to start live class') }
  }

  async function handleStop(id: number) {
    try { await clientFetch(`/api/v1/live/${id}/stop/`, { method: 'POST' }); toast.success('Live class stopped'); browserRef.current?.refresh() } catch { toast.error('Failed to stop live class') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Create Live Class</Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New Live Class</h2>
          <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Friday Flow Session" /></div>
          <div className="space-y-2"><Label>Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will you cover?" /></div>
          <div className="flex gap-4">
            <div className="space-y-2"><Label>Access</Label><select value={pricingType} onChange={(e) => setPricingType(e.target.value)} className={selectClasses}><option value="free">Free</option><option value="paid">Paid</option></select></div>
            {pricingType !== 'free' && <div className="space-y-2"><Label>Price</Label><Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></div>}
          </div>
          <div className="space-y-2"><Label>Scheduled Date</Label><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={autoRecording} onChange={(e) => setAutoRecording(e.target.checked)} className="h-4 w-4 rounded border-input" /><span className="text-sm">Auto-record this class</span></label>
          <div className="flex gap-2"><Button onClick={handleSave} disabled={!title.trim() || saving}>{saving ? 'Saving...' : 'Create'}</Button><Button variant="ghost" onClick={() => { setShowForm(false); resetForm() }}>Cancel</Button></div>
        </div>
      )}

      <MediaBrowser<LiveClass>
        ref={browserRef} persistKey="live-classes" fetchPage={fetchPage} sortOptions={SORT_OPTIONS} defaultSort="-created_at" galleryEnabled={false}
        emptyIcon={Video} emptyMessage="No live classes yet. Create one to get started." getItemId={(lc) => lc.id}
        onDelete={async (selection) => { await batchedAsync(selection.ids.map((id) => () => clientFetch(`/api/v1/live/${id}/`, { method: 'DELETE' }).catch(() => {}))); toast.success('Live classes deleted'); browserRef.current?.refresh() }}
        listColumns={[{ label: 'Status', key: 'status' }, { label: 'Title', key: 'title' }, { label: 'Date', key: 'date' }, { label: 'Pricing', key: 'pricing' }, { label: 'Actions', key: 'actions' }]}
        renderListRow={(lc) => (
          <>
            <TableCell><StatusBadge status={lc.status} /></TableCell>
            <TableCell><div className="min-w-0"><p className="font-medium truncate">{lc.title}</p>{lc.description && <p className="text-xs text-muted-foreground truncate">{lc.description}</p>}</div></TableCell>
            <TableCell><span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(lc.scheduled_at)}</span></TableCell>
            <TableCell><PricingBadge pricingType={lc.pricing_type} price={lc.price} /></TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(lc.id)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                {(lc.status === 'draft' || lc.status === 'scheduled') && <Button size="sm" onClick={() => handleStart(lc.id)} className="gap-1.5"><Play className="h-3.5 w-3.5" /> Go Live</Button>}
                {lc.status === 'live' && (<><Button size="sm" variant="outline" onClick={() => router.push(`/live/${lc.id}`)}>Join</Button><Button size="sm" variant="destructive" onClick={() => handleStop(lc.id)} className="gap-1.5"><Square className="h-3.5 w-3.5" /> End</Button></>)}
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(lc) =>
          editingId === lc.id ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel item={{ ...lc, scheduled_at: toLocalDatetimeValue(lc.scheduled_at) }} fields={liveClassFields} onSave={handleInlineUpdate} onCancel={() => setEditingId(null)} saving={saving} />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  )
}

// ─── Live Streams Tab ──────────────────────────────────────────────

const liveStreamFields: FieldConfig<LiveStream>[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'pricing_type', label: 'Access', type: 'select', options: [{ label: 'Free', value: 'free' }, { label: 'Paid', value: 'paid' }] },
  { key: 'price', label: 'Price', type: 'number', placeholder: '0.00', showWhen: (v) => v.pricing_type === 'paid' },
  { key: 'scheduled_at', label: 'Scheduled Date', type: 'datetime' },
]

function LiveStreamsTab() {
  const router = useRouter()
  const browserRef = useRef<MediaBrowserHandle>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pricingType, setPricingType] = useState('free')
  const [price, setPrice] = useState('')
  const [autoRecording, setAutoRecording] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')

  const fetchPage = useCallback(async (params: FetchPageParams): Promise<FetchPageResult<LiveStream>> => {
    return fetchAdminListPage<LiveStream>('/api/v1/live-streams/', params)
  }, [])

  function resetForm() { setTitle(''); setDescription(''); setPricingType('free'); setPrice(''); setAutoRecording(false); setScheduledAt('') }
  function openCreate() { resetForm(); setShowForm(true) }

  async function handleSave() {
    setSaving(true)
    try {
      const body = JSON.stringify({
        title, description, pricing_type: pricingType, auto_recording: autoRecording,
        ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
        ...(pricingType !== 'free' && price ? { price: parseFloat(price) } : {}),
      })
      await clientFetch('/api/v1/live-streams/', { method: 'POST', body })
      toast.success('Live stream created')
      resetForm(); setShowForm(false); browserRef.current?.refresh()
    } catch { toast.error('Failed to create live stream') } finally { setSaving(false) }
  }

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await clientFetch(`/api/v1/live-streams/${editingId}/`, {
        method: 'PUT',
        body: JSON.stringify({
          title: values.title, description: values.description, pricing_type: values.pricing_type,
          ...(values.scheduled_at ? { scheduled_at: new Date(values.scheduled_at as string).toISOString() } : {}),
          ...(values.pricing_type === 'paid' && values.price ? { price: parseFloat(values.price as string) } : {}),
        }),
      })
      toast.success('Live stream updated')
      setEditingId(null); browserRef.current?.refresh()
    } catch { toast.error('Failed to update live stream') } finally { setSaving(false) }
  }

  async function handleStart(id: number) {
    try { await clientFetch(`/api/v1/live-streams/${id}/start/`, { method: 'POST' }); router.push(`/live-stream/${id}`) } catch { toast.error('Failed to start live stream') }
  }

  async function handleStop(id: number) {
    try { await clientFetch(`/api/v1/live-streams/${id}/stop/`, { method: 'POST' }); toast.success('Live stream stopped'); browserRef.current?.refresh() } catch { toast.error('Failed to stop live stream') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Create Stream</Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New Live Stream</h2>
          <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly Q&A Stream" /></div>
          <div className="space-y-2"><Label>Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will you stream about?" /></div>
          <div className="flex gap-4">
            <div className="space-y-2"><Label>Access</Label><select value={pricingType} onChange={(e) => setPricingType(e.target.value)} className={selectClasses}><option value="free">Free</option><option value="paid">Paid</option></select></div>
            {pricingType !== 'free' && <div className="space-y-2"><Label>Price</Label><Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></div>}
          </div>
          <div className="space-y-2"><Label>Scheduled Date</Label><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={autoRecording} onChange={(e) => setAutoRecording(e.target.checked)} className="h-4 w-4 rounded border-input" /><span className="text-sm">Auto-record this stream</span></label>
          <div className="flex gap-2"><Button onClick={handleSave} disabled={!title.trim() || saving}>{saving ? 'Saving...' : 'Create'}</Button><Button variant="ghost" onClick={() => { setShowForm(false); resetForm() }}>Cancel</Button></div>
        </div>
      )}

      <MediaBrowser<LiveStream>
        ref={browserRef} persistKey="live-streams" fetchPage={fetchPage} sortOptions={SORT_OPTIONS} defaultSort="-created_at" galleryEnabled={false}
        emptyIcon={Radio} emptyMessage="No live streams yet. Create one to get started." getItemId={(ls) => ls.id}
        onDelete={async (selection) => { await batchedAsync(selection.ids.map((id) => () => clientFetch(`/api/v1/live-streams/${id}/`, { method: 'DELETE' }).catch(() => {}))); toast.success('Live streams deleted'); browserRef.current?.refresh() }}
        listColumns={[{ label: 'Status', key: 'status' }, { label: 'Title', key: 'title' }, { label: 'Date', key: 'date' }, { label: 'Pricing', key: 'pricing' }, { label: 'Actions', key: 'actions' }]}
        renderListRow={(ls) => (
          <>
            <TableCell><StatusBadge status={ls.status} /></TableCell>
            <TableCell><div className="min-w-0"><p className="font-medium truncate">{ls.title}</p>{ls.description && <p className="text-xs text-muted-foreground truncate">{ls.description}</p>}</div></TableCell>
            <TableCell><span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(ls.scheduled_at)}</span></TableCell>
            <TableCell><PricingBadge pricingType={ls.pricing_type} price={ls.price} /></TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(ls.id)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                {(ls.status === 'draft' || ls.status === 'scheduled') && <Button size="sm" onClick={() => handleStart(ls.id)} className="gap-1.5"><Play className="h-3.5 w-3.5" /> Go Live</Button>}
                {ls.status === 'live' && (<><Button size="sm" variant="outline" onClick={() => router.push(`/live-stream/${ls.id}`)}>Watch</Button><Button size="sm" variant="destructive" onClick={() => handleStop(ls.id)} className="gap-1.5"><Square className="h-3.5 w-3.5" /> End</Button></>)}
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(ls) =>
          editingId === ls.id ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel item={{ ...ls, scheduled_at: toLocalDatetimeValue(ls.scheduled_at) }} fields={liveStreamFields} onSave={handleInlineUpdate} onCancel={() => setEditingId(null)} saving={saving} />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  )
}

// ─── Zoom Classes Tab ──────────────────────────────────────────────

const zoomClassFields: FieldConfig<ZoomClass>[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'zoom_link', label: 'Zoom Link', type: 'text' },
  { key: 'pricing_type', label: 'Access', type: 'select', options: [{ label: 'Free', value: 'free' }, { label: 'Paid', value: 'paid' }] },
  { key: 'price', label: 'Price', type: 'number', placeholder: '0.00', showWhen: (v) => v.pricing_type === 'paid' },
  { key: 'scheduled_at', label: 'Scheduled Date', type: 'datetime' },
]

function ZoomClassesTab() {
  const browserRef = useRef<MediaBrowserHandle>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [zoomLink, setZoomLink] = useState('')
  const [pricingType, setPricingType] = useState('free')
  const [price, setPrice] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')

  const fetchPage = useCallback(async (params: FetchPageParams): Promise<FetchPageResult<ZoomClass>> => {
    return fetchAdminListPage<ZoomClass>('/api/v1/zoom-classes/', params)
  }, [])

  function resetForm() { setTitle(''); setDescription(''); setZoomLink(''); setPricingType('free'); setPrice(''); setScheduledAt('') }
  function openCreate() { resetForm(); setShowForm(true) }

  async function handleSave() {
    setSaving(true)
    try {
      const body = JSON.stringify({
        title, description, zoom_link: zoomLink, pricing_type: pricingType,
        ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
        ...(pricingType !== 'free' && price ? { price: parseFloat(price) } : {}),
      })
      await clientFetch('/api/v1/zoom-classes/', { method: 'POST', body })
      toast.success('Zoom class created')
      resetForm(); setShowForm(false); browserRef.current?.refresh()
    } catch { toast.error('Failed to create Zoom class') } finally { setSaving(false) }
  }

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await clientFetch(`/api/v1/zoom-classes/${editingId}/`, {
        method: 'PUT',
        body: JSON.stringify({
          title: values.title, description: values.description, zoom_link: values.zoom_link, pricing_type: values.pricing_type,
          ...(values.scheduled_at ? { scheduled_at: new Date(values.scheduled_at as string).toISOString() } : {}),
          ...(values.pricing_type === 'paid' && values.price ? { price: parseFloat(values.price as string) } : {}),
        }),
      })
      toast.success('Zoom class updated')
      setEditingId(null); browserRef.current?.refresh()
    } catch { toast.error('Failed to update Zoom class') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Create Zoom Class</Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New Zoom Class</h2>
          <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Group Coaching Session" /></div>
          <div className="space-y-2"><Label>Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will you cover?" /></div>
          <div className="space-y-2"><Label>Zoom Link</Label><Input value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} placeholder="https://zoom.us/j/..." /></div>
          <div className="space-y-2"><Label>Scheduled Date</Label><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
          <div className="flex gap-4">
            <div className="space-y-2"><Label>Access</Label><select value={pricingType} onChange={(e) => setPricingType(e.target.value)} className={selectClasses}><option value="free">Free</option><option value="paid">Paid</option></select></div>
            {pricingType !== 'free' && <div className="space-y-2"><Label>Price</Label><Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></div>}
          </div>
          <div className="flex gap-2"><Button onClick={handleSave} disabled={!title.trim() || saving}>{saving ? 'Saving...' : 'Create'}</Button><Button variant="ghost" onClick={() => { setShowForm(false); resetForm() }}>Cancel</Button></div>
        </div>
      )}

      <MediaBrowser<ZoomClass>
        ref={browserRef} persistKey="zoom-classes" fetchPage={fetchPage} sortOptions={SORT_OPTIONS} defaultSort="-created_at" galleryEnabled={false}
        emptyIcon={ExternalLink} emptyMessage="No Zoom classes yet. Create one to get started." getItemId={(zc) => zc.id}
        onDelete={async (selection) => { await batchedAsync(selection.ids.map((id) => () => clientFetch(`/api/v1/zoom-classes/${id}/`, { method: 'DELETE' }).catch(() => {}))); toast.success('Zoom classes deleted'); browserRef.current?.refresh() }}
        listColumns={[{ label: 'Status', key: 'status' }, { label: 'Title', key: 'title' }, { label: 'Date', key: 'date' }, { label: 'Pricing', key: 'pricing' }, { label: 'Actions', key: 'actions' }]}
        renderListRow={(zc) => (
          <>
            <TableCell><StatusBadge status={zc.status} /></TableCell>
            <TableCell><div className="min-w-0"><p className="font-medium truncate">{zc.title}</p>{zc.description && <p className="text-xs text-muted-foreground truncate">{zc.description}</p>}</div></TableCell>
            <TableCell><span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(zc.scheduled_at)}</span></TableCell>
            <TableCell><PricingBadge pricingType={zc.pricing_type} price={zc.price} /></TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(zc.id)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                {zc.zoom_link && (
                  <a href={zc.zoom_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                    <ExternalLink className="h-3.5 w-3.5" /> Open Zoom
                  </a>
                )}
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(zc) =>
          editingId === zc.id ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel item={{ ...zc, scheduled_at: toLocalDatetimeValue(zc.scheduled_at) }} fields={zoomClassFields} onSave={handleInlineUpdate} onCancel={() => setEditingId(null)} saving={saving} />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  )
}

// ─── Onsite Events Tab ─────────────────────────────────────────────

const onsiteEventFields: FieldConfig<OnsiteEvent>[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'max_capacity', label: 'Max Capacity', type: 'number' },
  { key: 'pricing_type', label: 'Access', type: 'select', options: [{ label: 'Free', value: 'free' }, { label: 'Paid', value: 'paid' }] },
  { key: 'price', label: 'Price', type: 'number', placeholder: '0.00', showWhen: (v) => v.pricing_type === 'paid' },
  { key: 'scheduled_at', label: 'Scheduled Date', type: 'datetime' },
]

function OnsiteEventsTab() {
  const browserRef = useRef<MediaBrowserHandle>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [address, setAddress] = useState('')
  const [maxCapacity, setMaxCapacity] = useState('')
  const [pricingType, setPricingType] = useState('free')
  const [price, setPrice] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')

  const fetchPage = useCallback(async (params: FetchPageParams): Promise<FetchPageResult<OnsiteEvent>> => {
    return fetchAdminListPage<OnsiteEvent>('/api/v1/onsite-events/', params)
  }, [])

  function resetForm() { setTitle(''); setDescription(''); setLocation(''); setAddress(''); setMaxCapacity(''); setPricingType('free'); setPrice(''); setScheduledAt('') }
  function openCreate() { resetForm(); setShowForm(true) }

  async function handleSave() {
    setSaving(true)
    try {
      const body = JSON.stringify({
        title, description, location, address, pricing_type: pricingType,
        ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
        ...(maxCapacity ? { max_capacity: parseInt(maxCapacity) } : {}),
        ...(pricingType !== 'free' && price ? { price: parseFloat(price) } : {}),
      })
      await clientFetch('/api/v1/onsite-events/', { method: 'POST', body })
      toast.success('Event created')
      resetForm(); setShowForm(false); browserRef.current?.refresh()
    } catch { toast.error('Failed to create event') } finally { setSaving(false) }
  }

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await clientFetch(`/api/v1/onsite-events/${editingId}/`, {
        method: 'PUT',
        body: JSON.stringify({
          title: values.title, description: values.description, location: values.location, address: values.address, pricing_type: values.pricing_type,
          ...(values.scheduled_at ? { scheduled_at: new Date(values.scheduled_at as string).toISOString() } : {}),
          ...(values.max_capacity ? { max_capacity: parseInt(values.max_capacity as string) } : {}),
          ...(values.pricing_type === 'paid' && values.price ? { price: parseFloat(values.price as string) } : {}),
        }),
      })
      toast.success('Event updated')
      setEditingId(null); browserRef.current?.refresh()
    } catch { toast.error('Failed to update event') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Create Event</Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New On-site Event</h2>
          <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend Workshop" /></div>
          <div className="space-y-2"><Label>Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this event about?" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Studio A, Downtown" /></div>
            <div className="space-y-2"><Label>Address (optional)</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" /></div>
          </div>
          <div className="space-y-2"><Label>Scheduled Date</Label><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
          <div className="flex gap-4">
            <div className="space-y-2"><Label>Max Capacity</Label><Input type="number" min="1" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="Unlimited" /></div>
            <div className="space-y-2"><Label>Access</Label><select value={pricingType} onChange={(e) => setPricingType(e.target.value)} className={selectClasses}><option value="free">Free</option><option value="paid">Paid</option></select></div>
            {pricingType !== 'free' && <div className="space-y-2"><Label>Price</Label><Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></div>}
          </div>
          <div className="flex gap-2"><Button onClick={handleSave} disabled={!title.trim() || saving}>{saving ? 'Saving...' : 'Create'}</Button><Button variant="ghost" onClick={() => { setShowForm(false); resetForm() }}>Cancel</Button></div>
        </div>
      )}

      <MediaBrowser<OnsiteEvent>
        ref={browserRef} persistKey="onsite-events" fetchPage={fetchPage} sortOptions={SORT_OPTIONS} defaultSort="-created_at" galleryEnabled={false}
        emptyIcon={MapPin} emptyMessage="No on-site events yet. Create one to get started." getItemId={(ev) => ev.id}
        onDelete={async (selection) => { await batchedAsync(selection.ids.map((id) => () => clientFetch(`/api/v1/onsite-events/${id}/`, { method: 'DELETE' }).catch(() => {}))); toast.success('Events deleted'); browserRef.current?.refresh() }}
        listColumns={[{ label: 'Status', key: 'status' }, { label: 'Title', key: 'title' }, { label: 'Date', key: 'date' }, { label: 'Location', key: 'location' }, { label: 'Pricing', key: 'pricing' }, { label: 'Actions', key: 'actions' }]}
        renderListRow={(ev) => (
          <>
            <TableCell><StatusBadge status={ev.status} /></TableCell>
            <TableCell><div className="min-w-0"><p className="font-medium truncate">{ev.title}</p>{ev.description && <p className="text-xs text-muted-foreground truncate">{ev.description}</p>}</div></TableCell>
            <TableCell><span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(ev.scheduled_at)}</span></TableCell>
            <TableCell>
              {ev.location ? (
                <div className="flex items-center gap-1 text-sm"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{ev.location}</span></div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell><PricingBadge pricingType={ev.pricing_type} price={ev.price} /></TableCell>
            <TableCell>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(ev.id)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            </TableCell>
          </>
        )}
        renderExpandedRow={(ev) =>
          editingId === ev.id ? (
            <TableRow>
              <TableCell colSpan={7} className="p-0">
                <InlineEditPanel item={{ ...ev, scheduled_at: toLocalDatetimeValue(ev.scheduled_at), max_capacity: ev.max_capacity ? String(ev.max_capacity) : '' } as unknown as OnsiteEvent} fields={onsiteEventFields} onSave={handleInlineUpdate} onCancel={() => setEditingId(null)} saving={saving} />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────

export default function LiveEventsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live Events</h1>
        <p className="text-sm text-muted-foreground">
          Manage live classes, streams, Zoom sessions, and on-site events.
        </p>
      </div>

      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes">Live Classes</TabsTrigger>
          <TabsTrigger value="streams">Live Streams</TabsTrigger>
          <TabsTrigger value="zoom">Zoom Classes</TabsTrigger>
          <TabsTrigger value="onsite">On-site Events</TabsTrigger>
        </TabsList>

        <TabsContent value="classes">
          <p className="mb-4 text-sm text-muted-foreground">Host interactive live sessions on the platform with video, audio, and screen sharing.</p>
          <LiveClassesTab />
        </TabsContent>
        <TabsContent value="streams">
          <p className="mb-4 text-sm text-muted-foreground">Broadcast one-to-many streams to your audience with live chat.</p>
          <LiveStreamsTab />
        </TabsContent>
        <TabsContent value="zoom">
          <p className="mb-4 text-sm text-muted-foreground">Schedule and share Zoom meeting links with your students.</p>
          <ZoomClassesTab />
        </TabsContent>
        <TabsContent value="onsite">
          <p className="mb-4 text-sm text-muted-foreground">Organize in-person events, workshops, and meetups at a physical location.</p>
          <OnsiteEventsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
