import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BASE_DOMAIN } from '@/lib/constants'

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Platform Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">CONTENTOR_DOMAIN</dt>
                <dd className="mt-1 text-sm font-mono">{BASE_DOMAIN}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Superusers</dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  Configured via SUPERUSER_EMAILS environment variable
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">More settings will be available in future releases.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
