'use client'

import { useEffect, useState } from 'react'
import { Database, Server, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface HealthStatus {
  status: string
  db: string
  redis: string
}

function HealthSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-6 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function checkHealth() {
    setLoading(true)
    setError('')
    fetch('/api/health/', { credentials: 'same-origin' })
      .then(async (res) => {
        return res.json()
      })
      .then((data) => {
        setHealth(data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to reach health endpoint')
        setLoading(false)
      })
  }

  useEffect(() => {
    checkHealth()
  }, [])

  const services = health
    ? [
        { name: 'Overall', status: health.status, icon: Activity },
        { name: 'Database', status: health.db, icon: Database },
        { name: 'Redis', status: health.redis, icon: Server },
      ]
    : []

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Health</h1>
          <p className="text-sm text-muted-foreground">Service health checks and status.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkHealth}
          loading={loading}
          className="gap-2"
        >
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading && !health ? (
        <HealthSkeleton />
      ) : (
        health && (
          <div className="grid gap-4 md:grid-cols-3">
            {services.map((service) => {
              const isOk = service.status === 'ok'
              const Icon = service.icon
              return (
                <Card key={service.name}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {service.name}
                    </CardTitle>
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-block h-3 w-3 rounded-full ${
                          isOk
                            ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                            : 'bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.4)]'
                        }`}
                      />
                      <Badge variant={isOk ? 'success' : 'destructive'}>
                        {isOk ? 'Healthy' : 'Error'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
