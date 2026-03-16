'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PlatformHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-200',
        scrolled
          ? 'border-b bg-background/80 backdrop-blur-md'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Contentor
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign In
          </Link>
          <Button asChild size="sm" className="h-8 px-4">
            <Link href="/signup">Get Started</Link>
          </Button>
        </nav>

        <button
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t bg-background px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link href="#features" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Features</Link>
            <Link href="/pricing" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link href="/login" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Sign In</Link>
            <Button asChild size="sm" className="w-full"><Link href="/signup" onClick={() => setMobileOpen(false)}>Get Started</Link></Button>
          </nav>
        </div>
      )}
    </header>
  )
}
