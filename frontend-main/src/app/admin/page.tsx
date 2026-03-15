'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlatformDashboard } from '@/types/tenant'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<PlatformDashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/platform/dashboard/', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load dashboard')
        return res.json()
      })
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <p className="text-destructive">{error}</p>
  }

  if (!data) {
    return <p className="text-muted-foreground">Loading dashboard...</p>
  }

  const stats = [
    { label: 'Total Tenants', value: data.total_tenants },
    { label: 'Active Tenants', value: data.active_tenants },
    { label: 'Total Students', value: data.total_students },
    { label: 'Storage Used', value: formatBytes(data.total_storage_bytes) },
  ]

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
