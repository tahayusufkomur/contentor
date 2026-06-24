import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { getMyTenants } from '@/lib/tenants'
import { DomainWizard } from './wizard'

export default async function DomainWizardPage({ params }: { params: { slug: string } }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const tenants = await getMyTenants()
  const tenant = tenants.find((t) => t.slug === params.slug)
  if (!tenant) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Custom domain</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        For <span className="font-medium text-foreground">{tenant.name}</span> ({tenant.domain})
      </p>
      <div className="mt-8">
        <DomainWizard
          slug={tenant.slug}
          host={tenant.domain}
          defaultEmail={user.email ?? ''}
          defaultName={user.name ?? ''}
        />
      </div>
    </main>
  )
}
