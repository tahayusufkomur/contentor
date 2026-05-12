import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, Clock, Globe2, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'
import { LogoMark } from '@/components/shared/logo-mark'
import { getAuthUser } from '@/lib/auth'
import { getMyTenants, type MyTenant } from '@/lib/tenants'

const STATUS_COPY: Record<MyTenant['provisioning_status'], { label: string; tone: string }> = {
  ready: { label: 'Live', tone: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300' },
  provisioning: { label: 'Setting up', tone: 'bg-primary/12 text-primary' },
  pending: { label: 'Pending', tone: 'bg-foreground/[0.06] text-muted-foreground' },
  failed: { label: 'Setup failed', tone: 'bg-destructive/12 text-destructive' },
}

function PlatformCard({ tenant }: { tenant: MyTenant }) {
  const status = STATUS_COPY[tenant.provisioning_status]
  const isReady = tenant.provisioning_status === 'ready' && tenant.is_active

  return (
    <div className="glass-pane group relative flex flex-col p-7 transition-transform duration-300 hover:-translate-y-1">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl glass-strong">
          <LogoMark size={28} />
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.tone}`}
        >
          {status.label}
        </span>
      </div>

      <h3 className="text-headline mt-5 text-xl text-foreground">
        {tenant.name}
      </h3>
      <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Globe2 className="h-3.5 w-3.5" />
        {tenant.domain || `${tenant.slug}.contentor.app`}
      </p>

      <div className="mt-5 flex items-center gap-4 text-[12.5px] text-muted-foreground/90">
        <span>
          Plan{' '}
          <span className="font-medium text-foreground/85">
            {tenant.plan_name ?? 'Free'}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(tenant.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>

      <div className="mt-7 flex items-center gap-2">
        {isReady ? (
          <Button asChild variant="brand" size="sm" className="gap-1.5">
            <a href={tenant.studio_url}>
              Open studio
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {status.label}
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <a href={tenant.studio_url}>Preview</a>
        </Button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="glass-pane mx-auto max-w-2xl p-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl glass-strong">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-headline mt-6 text-2xl">Launch your first platform</h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        Create a beautifully designed studio for your courses, live classes, and
        email campaigns — all under your own brand.
      </p>
      <Button asChild variant="brand" size="lg" className="mt-7 gap-2">
        <Link href="/signup">
          <Plus className="h-4 w-4" />
          New platform
        </Link>
      </Button>
    </div>
  )
}

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  // Superadmins live in /admin — keep this surface coach-only.
  if (user.is_superuser) redirect('/admin')

  const tenants = await getMyTenants()

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      <section className="relative isolate overflow-hidden px-6 pb-12 pt-28 md:pt-32">
        <div className="absolute inset-0 -z-10">
          <div className="aurora animate-aurora" />
          <div className="grid-fade absolute inset-0 opacity-50" />
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-eyebrow text-muted-foreground/80">
                {user.name ? `Hi, ${user.name.split(' ')[0]}` : 'Your studio'}
              </p>
              <h1 className="text-display mt-3 text-5xl leading-[1.05] md:text-6xl">
                <span className="text-foreground/95">Your</span>{' '}
                <span className="brand-gradient">platforms</span>
              </h1>
              <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-muted-foreground">
                Manage and open each studio you&apos;ve created with Contentor.
                Launch more whenever inspiration strikes.
              </p>
            </div>

            {tenants.length > 0 && (
              <Button asChild variant="brand" size="lg" className="gap-2">
                <Link href="/signup">
                  <Plus className="h-4 w-4" />
                  New platform
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="mx-auto max-w-6xl">
          {tenants.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {tenants.map((tenant) => (
                <PlatformCard key={tenant.id} tenant={tenant} />
              ))}
            </div>
          )}
        </div>
      </section>

      <PlatformFooter />
    </div>
  )
}
