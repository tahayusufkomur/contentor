'use client'

import { useEffect, useState } from 'react'
import { Users, HardDrive, Video, Mail, Percent, Pencil, Check, X, Plus, Archive, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import type { PlatformPlan } from '@/types/tenant'

const CURRENCIES = ['USD', 'TRY'] as const
type Currency = (typeof CURRENCIES)[number]

function isFreePlan(plan: PlatformPlan) {
  return plan.name.toLowerCase() === 'free' || Number(plan.price_monthly) === 0
}

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

function PlanSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-2 h-8 w-16" />
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

/** Shared limit/fee/live fields used by both the edit and create forms. */
function LimitFields({
  fee,
  setFee,
  maxStudents,
  setMaxStudents,
  maxStorage,
  setMaxStorage,
  maxStreaming,
  setMaxStreaming,
  maxEmails,
  setMaxEmails,
  live,
  setLive,
  idPrefix,
}: {
  fee: string
  setFee: (v: string) => void
  maxStudents: string
  setMaxStudents: (v: string) => void
  maxStorage: string
  setMaxStorage: (v: string) => void
  maxStreaming: string
  setMaxStreaming: (v: string) => void
  maxEmails: string
  setMaxEmails: (v: string) => void
  live: boolean
  setLive: (v: boolean) => void
  idPrefix: string
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={`fee-${idPrefix}`}>Transaction fee (%)</Label>
        <Input id={`fee-${idPrefix}`} type="number" step="0.01" min="0" max="100" value={fee} onChange={(e) => setFee(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`students-${idPrefix}`}>Max students</Label>
        <Input id={`students-${idPrefix}`} type="number" step="1" min="0" value={maxStudents} onChange={(e) => setMaxStudents(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`storage-${idPrefix}`}>Storage (GB)</Label>
        <Input id={`storage-${idPrefix}`} type="number" step="1" min="0" value={maxStorage} onChange={(e) => setMaxStorage(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`streaming-${idPrefix}`}>Streaming (hrs)</Label>
        <Input id={`streaming-${idPrefix}`} type="number" step="1" min="0" value={maxStreaming} onChange={(e) => setMaxStreaming(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`emails-${idPrefix}`}>Emails / month</Label>
        <Input id={`emails-${idPrefix}`} type="number" step="1" min="0" value={maxEmails} onChange={(e) => setMaxEmails(e.target.value)} />
      </div>
      <div className="flex items-center justify-between rounded-md border px-3">
        <Label htmlFor={`live-${idPrefix}`} className="cursor-pointer">
          Live enabled
        </Label>
        <Switch id={`live-${idPrefix}`} checked={live} onCheckedChange={setLive} />
      </div>
    </div>
  )
}

function CreatePlanCard({ onCreated, onCancel }: { onCreated: (p: PlatformPlan) => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [usd, setUsd] = useState('')
  const [tryAmt, setTryAmt] = useState('')
  const [fee, setFee] = useState('5')
  const [maxStudents, setMaxStudents] = useState('0')
  const [maxStorage, setMaxStorage] = useState('0')
  const [maxStreaming, setMaxStreaming] = useState('0')
  const [maxEmails, setMaxEmails] = useState('0')
  const [live, setLive] = useState(false)

  async function create() {
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        transaction_fee_pct: fee,
        max_students: Number(maxStudents),
        max_storage_gb: Number(maxStorage),
        max_streaming_hours: Number(maxStreaming),
        max_campaign_emails: Number(maxEmails),
        is_live_enabled: live,
      }
      const amounts: Partial<Record<Currency, number>> = {}
      if (usd !== '') amounts.USD = Math.round(parseFloat(usd) * 100)
      if (tryAmt !== '') amounts.TRY = Math.round(parseFloat(tryAmt) * 100)
      if (Object.keys(amounts).length) payload.amounts = amounts

      const res = await fetch('/api/v1/platform/plans/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || body?.name?.[0] || body?.amounts?.[0] || 'Failed to create plan')
      }
      onCreated(await res.json())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">New plan</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button size="sm" onClick={create} disabled={saving || name.trim() === ''}>
              <Check className="h-4 w-4" /> {saving ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="new-plan-name">Name</Label>
          <Input id="new-plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pro" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-plan-usd">Monthly price (USD)</Label>
            <Input id="new-plan-usd" type="number" step="0.01" min="0" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="Leave blank for free" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-plan-try">Monthly price (TRY)</Label>
            <Input id="new-plan-try" type="number" step="0.01" min="0" value={tryAmt} onChange={(e) => setTryAmt(e.target.value)} placeholder="Leave blank for free" />
          </div>
        </div>
        <LimitFields
          fee={fee}
          setFee={setFee}
          maxStudents={maxStudents}
          setMaxStudents={setMaxStudents}
          maxStorage={maxStorage}
          setMaxStorage={setMaxStorage}
          maxStreaming={maxStreaming}
          setMaxStreaming={setMaxStreaming}
          maxEmails={maxEmails}
          setMaxEmails={setMaxEmails}
          live={live}
          setLive={setLive}
          idPrefix="new"
        />
        <p className="text-xs text-muted-foreground">Setting a price provisions a Stripe Price automatically.</p>
      </CardContent>
    </Card>
  )
}

function PlanCard({ plan, onSaved }: { plan: PlatformPlan; onSaved: (p: PlatformPlan) => void }) {
  const free = isFreePlan(plan)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)

  // Form state (strings so inputs stay controlled).
  const usdCents = plan.prices?.USD?.amount_cents ?? Math.round(Number(plan.price_monthly) * 100)
  const tryCents = plan.prices?.TRY?.amount_cents ?? 0
  const [usd, setUsd] = useState((usdCents / 100).toFixed(2))
  const [tryAmt, setTryAmt] = useState((tryCents / 100).toFixed(2))
  const [fee, setFee] = useState(plan.transaction_fee_pct)
  const [maxStudents, setMaxStudents] = useState(String(plan.max_students))
  const [maxStorage, setMaxStorage] = useState(String(plan.max_storage_gb))
  const [maxStreaming, setMaxStreaming] = useState(String(plan.max_streaming_hours))
  const [maxEmails, setMaxEmails] = useState(String(plan.max_campaign_emails))
  const [live, setLive] = useState(plan.is_live_enabled)

  function resetForm() {
    setUsd((usdCents / 100).toFixed(2))
    setTryAmt((tryCents / 100).toFixed(2))
    setFee(plan.transaction_fee_pct)
    setMaxStudents(String(plan.max_students))
    setMaxStorage(String(plan.max_storage_gb))
    setMaxStreaming(String(plan.max_streaming_hours))
    setMaxEmails(String(plan.max_campaign_emails))
    setLive(plan.is_live_enabled)
    setError('')
  }

  async function patch(payload: Record<string, unknown>, opts?: { method?: string }) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/v1/platform/plans/${plan.id}/`, {
        method: opts?.method ?? 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: opts?.method === 'DELETE' ? undefined : JSON.stringify(payload),
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || body?.amounts?.[0] || 'Failed to save plan')
      }
      onSaved(await res.json())
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save plan')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    const payload: Record<string, unknown> = {
      transaction_fee_pct: fee,
      max_students: Number(maxStudents),
      max_storage_gb: Number(maxStorage),
      max_streaming_hours: Number(maxStreaming),
      max_campaign_emails: Number(maxEmails),
      is_live_enabled: live,
    }
    // Free coaches can never get paid, so amounts are meaningless for Free.
    if (!free) {
      const amounts: Partial<Record<Currency, number>> = {}
      if (usd !== '') amounts.USD = Math.round(parseFloat(usd) * 100)
      if (tryAmt !== '') amounts.TRY = Math.round(parseFloat(tryAmt) * 100)
      if (Object.keys(amounts).length) payload.amounts = amounts
    }
    if (await patch(payload)) setEditing(false)
  }

  async function archive() {
    if (await patch({}, { method: 'DELETE' })) setConfirmArchive(false)
  }

  if (editing) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl capitalize">{plan.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetForm()
                  setEditing(false)
                }}
                disabled={saving}
              >
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {!free && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`usd-${plan.id}`}>Monthly price (USD)</Label>
                <Input id={`usd-${plan.id}`} type="number" step="0.01" min="0" value={usd} onChange={(e) => setUsd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`try-${plan.id}`}>Monthly price (TRY)</Label>
                <Input id={`try-${plan.id}`} type="number" step="0.01" min="0" value={tryAmt} onChange={(e) => setTryAmt(e.target.value)} />
              </div>
            </div>
          )}
          <LimitFields
            fee={fee}
            setFee={setFee}
            maxStudents={maxStudents}
            setMaxStudents={setMaxStudents}
            maxStorage={maxStorage}
            setMaxStorage={setMaxStorage}
            maxStreaming={maxStreaming}
            setMaxStreaming={setMaxStreaming}
            maxEmails={maxEmails}
            setMaxEmails={setMaxEmails}
            live={live}
            setLive={setLive}
            idPrefix={String(plan.id)}
          />
          {!free && (
            <p className="text-xs text-muted-foreground">
              Changing a price creates a new Stripe Price; existing subscribers keep their current price.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={plan.is_active ? undefined : 'opacity-60'}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl capitalize">{plan.name}</CardTitle>
          <div className="flex items-center gap-2">
            {!plan.is_active && <Badge variant="secondary">Archived</Badge>}
            {plan.is_live_enabled ? (
              <Badge variant="success">Live Enabled</Badge>
            ) : (
              <Badge variant="secondary">No Live</Badge>
            )}
            {plan.is_active && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${plan.name}`}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-foreground">{free ? 'Free' : formatMoney(usdCents, 'USD')}</span>
          {!free && <span className="text-sm text-muted-foreground">/month</span>}
        </div>
        {!free && tryCents > 0 && (
          <p className="text-sm text-muted-foreground">{formatMoney(tryCents, 'TRY')} / month</p>
        )}
      </CardHeader>
      <CardContent>
        <Separator className="mb-4" />
        <ul className="space-y-3">
          <li className="flex items-center gap-3 text-sm">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Max Students:</span>
            <span className="ml-auto font-medium text-foreground">{plan.max_students}</span>
          </li>
          <li className="flex items-center gap-3 text-sm">
            <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Storage:</span>
            <span className="ml-auto font-medium text-foreground">{plan.max_storage_gb} GB</span>
          </li>
          <li className="flex items-center gap-3 text-sm">
            <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Streaming:</span>
            <span className="ml-auto font-medium text-foreground">{plan.max_streaming_hours} hrs</span>
          </li>
          <li className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Emails/mo:</span>
            <span className="ml-auto font-medium text-foreground">{plan.max_campaign_emails.toLocaleString()}</span>
          </li>
          <li className="flex items-center gap-3 text-sm">
            <Percent className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Transaction Fee:</span>
            <span className="ml-auto font-medium text-foreground">{plan.transaction_fee_pct}%</span>
          </li>
        </ul>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {!free && (
          <>
            <Separator className="my-4" />
            {plan.is_active ? (
              confirmArchive ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Archive this plan?</span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(false)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button variant="destructive" size="sm" onClick={archive} disabled={saving}>
                      {saving ? 'Archiving…' : 'Confirm'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmArchive(true)}>
                  <Archive className="h-4 w-4" /> Archive
                </Button>
              )
            ) : (
              <Button variant="ghost" size="sm" onClick={() => patch({ is_active: true })} disabled={saving}>
                <RotateCcw className="h-4 w-4" /> {saving ? 'Reactivating…' : 'Reactivate'}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/v1/platform/plans/', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load plans')
        return res.json()
      })
      .then((data) => {
        setPlans(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  function handleSaved(updated: PlatformPlan) {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  function handleCreated(created: PlatformPlan) {
    setPlans((prev) => [...prev, created])
    setCreating(false)
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Plans</h1>
          <p className="text-sm text-muted-foreground">Platform subscription plans, limits, and pricing.</p>
        </div>
        {!loading && !creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New plan
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {creating && <CreatePlanCard onCreated={handleCreated} onCancel={() => setCreating(false)} />}
        {loading
          ? [1, 2, 3].map((i) => <PlanSkeleton key={i} />)
          : plans.map((plan) => <PlanCard key={plan.id} plan={plan} onSaved={handleSaved} />)}
      </div>
    </div>
  )
}
