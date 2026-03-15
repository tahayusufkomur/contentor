import { Settings, Globe, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/shared/empty-state'
import { BASE_DOMAIN } from '@/lib/constants'

export default function SettingsPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Platform configuration and environment.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-muted-foreground" />
            Platform Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <dt className="text-sm font-medium text-muted-foreground sm:w-48">CONTENTOR_DOMAIN</dt>
              <dd className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm text-foreground">{BASE_DOMAIN}</dd>
            </div>
            <Separator />
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground sm:w-48">
                <ShieldCheck className="h-4 w-4" />
                Superusers
              </dt>
              <dd className="text-sm text-muted-foreground">
                Configured via <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">SUPERUSER_EMAILS</code> environment variable
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={Settings}
            title="More settings coming soon"
            description="Additional configuration options will be available in future releases."
          />
        </CardContent>
      </Card>
    </div>
  )
}
