'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface HealthStatus {
  status: string
  db: string
  redis: string
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/health/', { credentials: 'same-origin' })
      .then(async (res) => {
        return res.json()
      })
      .then(setHealth)
      .catch(() => setError('Failed to reach health endpoint'))
  }, [])

  if (error) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Health</h1>
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (!health) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Health</h1>
        <p className="text-muted-foreground">Checking health...</p>
      </div>
    )
  }

  const services = [
    { name: 'Overall', status: health.status },
    { name: 'Database', status: health.db },
    { name: 'Redis', status: health.redis },
  ]

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Health</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {services.map((service) => (
          <Card key={service.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{service.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  service.status === 'ok'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {service.status === 'ok' ? 'Healthy' : 'Error'}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
