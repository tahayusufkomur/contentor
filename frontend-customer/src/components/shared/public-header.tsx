'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/hooks/use-tenant'
import { BookOpen, Menu, X } from 'lucide-react'

export function PublicHeader() {
  const config = useTenant()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-primary/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          {config?.logo_url ? (
            <img src={config.logo_url} alt={config.brand_name} className="h-8 w-auto" />
          ) : (
            <BookOpen className="h-5 w-5 text-primary" />
          )}
          <span className="font-display">{config?.brand_name || 'Welcome'}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/courses"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Courses
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Sign In</Link>
          </Button>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link
              href="/courses"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Courses
            </Link>
            <Button asChild size="sm" className="w-full">
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                Sign In
              </Link>
            </Button>
          </nav>
        </div>
      )}
    </header>
  )
}
