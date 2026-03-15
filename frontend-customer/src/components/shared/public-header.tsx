'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/hooks/use-tenant'

export function PublicHeader() {
  const config = useTenant()
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold">{config?.brand_name || 'Welcome'}</Link>
        <nav className="flex items-center gap-6">
          <Link href="/courses" className="text-sm text-muted-foreground hover:text-foreground">Courses</Link>
          <Button asChild size="sm"><Link href="/login">Sign In</Link></Button>
        </nav>
      </div>
    </header>
  )
}
