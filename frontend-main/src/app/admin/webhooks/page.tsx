'use client'

import { useEffect, useState } from 'react'
import { Webhook } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { WebhookEventRow } from '@/types/tenant'

type StatusFilter = '' | 'failed' | 'pending'

function eventBadge(e: WebhookEventRow): { label: string; variant: 'success' | 'warning' | 'destructive' } {
  if (e.processing_error) return { label: 'failed', variant: 'destructive' }
  if (!e.processed_at) return { label: 'pending', variant: 'warning' }
  return { label: 'processed', variant: 'success' }
}

export default function WebhooksPage() {
  const [events, setEvents] = useState<WebhookEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [typeFilter, setTypeFilter] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [payloads, setPayloads] = useState<Record<number, unknown>>({})

  useEffect(() => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (typeFilter) params.set('event_type', typeFilter)
    setLoading(true)
    fetch(`/api/v1/platform/webhook-events/?${params}`, { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load webhook events')
        return res.json()
      })
      .then(setEvents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [statusFilter, typeFilter])

  async function toggleExpand(id: number) {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    if (!(id in payloads)) {
      const res = await fetch(`/api/v1/platform/webhook-events/${id}/`, {
        credentials: 'same-origin',
      })
      if (res.ok) {
        const data = await res.json()
        setPayloads((prev) => ({ ...prev, [id]: data.payload }))
      }
    }
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Webhooks</h1>
          <p className="text-sm text-muted-foreground">
            Recent provider events — click a row to inspect the raw payload.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter by event type…"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-56"
          />
          {(['', 'failed', 'pending'] as StatusFilter[]).map((f) => (
            <Button
              key={f || 'all'}
              variant={statusFilter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(f)}
            >
              {f || 'all'}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              icon={Webhook}
              title="No events"
              description="Webhook events will appear here as providers deliver them."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Event ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => {
                  const badge = eventBadge(e)
                  return (
                    <>
                      <TableRow
                        key={e.id}
                        className="cursor-pointer"
                        onClick={() => toggleExpand(e.id)}
                      >
                        <TableCell className="font-medium">{e.event_type}</TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                          {e.provider_event_id}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {new Date(e.received_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                      {expanded === e.id && (
                        <TableRow key={`${e.id}-payload`}>
                          <TableCell colSpan={4} className="bg-muted/30">
                            {e.processing_error && (
                              <p className="mb-2 text-sm text-destructive">{e.processing_error}</p>
                            )}
                            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                              {payloads[e.id] !== undefined
                                ? JSON.stringify(payloads[e.id], null, 2)
                                : 'Loading payload…'}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
