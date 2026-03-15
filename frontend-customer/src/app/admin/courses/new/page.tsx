'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clientFetch } from '@/lib/api-client'
import type { Course } from '@/types/course'

export default function NewCoursePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    pricing_type: 'free' as 'free' | 'paid' | 'subscription',
    price: '0.00',
    is_published: false,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const course = await clientFetch<Course>('/api/v1/courses/', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      router.push(`/admin/courses/${course.slug}`)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">New Course</h1>
      <Card>
        <CardHeader>
          <CardTitle>Course Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pricing Type</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={form.pricing_type}
                  onChange={(e) =>
                    setForm({ ...form, pricing_type: e.target.value as 'free' | 'paid' | 'subscription' })
                  }
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="subscription">Subscription</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_published"
                checked={form.is_published}
                onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_published">Publish immediately</Label>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create Course'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
