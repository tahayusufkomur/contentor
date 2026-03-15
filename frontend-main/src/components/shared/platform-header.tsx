'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function PlatformHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold text-primary">
          Contentor
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Features
          </Link>
          <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Login
          </Link>
          <Button asChild size="sm">
            <Link href="/signup">Start Free Trial</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
