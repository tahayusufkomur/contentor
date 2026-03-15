import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MagicLinkForm } from '@/components/auth/magic-link-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Platform Admin</CardTitle>
          <CardDescription>Sign in to manage your platform</CardDescription>
        </CardHeader>
        <CardContent>
          <MagicLinkForm />
        </CardContent>
      </Card>
    </div>
  )
}
