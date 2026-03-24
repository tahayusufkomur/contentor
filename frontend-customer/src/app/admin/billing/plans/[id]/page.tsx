'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { clientFetch } from '@/lib/api-client'
import { ContentPicker, type SelectedItem } from '@/components/billing/content-picker'

interface PlanAccess {
  items: Array<{
    content_type: string
    object_id: number
    title?: string
    price?: string
  }>
}

interface Plan {
  id: number
  name: string
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

export default function PlanAccessPage() {
  const params = useParams()
  const id = params.id as string

  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])

  useEffect(() => {
    async function load() {
      try {
        const [planData, accessData] = await Promise.all([
          clientFetch<Plan>(`/api/v1/billing/plans/${id}/`),
          clientFetch<PlanAccess>(`/api/v1/billing/plans/${id}/access/`),
        ])
        setPlan(planData)
        setSelectedItems(
          (accessData.items ?? []).map((item) => ({
            content_type: item.content_type,
            object_id: item.object_id,
            title: item.title ?? `Item ${item.object_id}`,
            price: item.price ?? '0',
          }))
        )
      } catch (err) {
        console.error(err)
        toast.error('Failed to load plan access data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function handleSave() {
    setSaving(true)
    try {
      await clientFetch(`/api/v1/billing/plans/${id}/access/`, {
        method: 'PUT',
        body: JSON.stringify({
          items: selectedItems.map((i) => ({
            content_type: i.content_type,
            object_id: i.object_id,
          })),
        }),
      })
      toast.success('Plan access updated successfully.')
    } catch (err) {
      console.error(err)
      toast.error('Failed to update plan access. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {loading ? 'Manage Plan Access' : `Manage Access: ${plan?.name ?? ''}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose which content subscribers of this plan can access.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Content Access
          </CardTitle>
          <CardDescription>
            Select the courses, downloads, live classes, and live streams included in this subscription plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <ContentPicker selected={selectedItems} onChange={setSelectedItems} />
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save Access'}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/admin/billing">Cancel</Link>
        </Button>
      </div>
    </div>
  )
}
