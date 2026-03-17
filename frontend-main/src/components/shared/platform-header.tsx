'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, Menu, User as UserIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User } from '@/types/auth'

export function PlatformHeader({ user }: { user?: User | null }) {
  const router = useRouter()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleSignOut = async () => {
    setSigningOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  const isCoach = user?.role === 'coach' || user?.role === 'owner'

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-200',
        scrolled
          ? 'border-b border-primary/10 bg-background/80 backdrop-blur-md'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="font-display italic text-base font-semibold tracking-tight">
          Contentor
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="#features"
            className="nav-link text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="nav-link text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          {user ? (
            <>
              <Link
                href="/admin"
                className="nav-link text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Dashboard
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="h-8 gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="nav-link text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign In
              </Link>
              <Button
                asChild
                size="sm"
                className="h-8 border-0 bg-primary text-primary-foreground px-4 shadow-sm"
              >
                <Link href="/signup">Get Started</Link>
              </Button>
            </>
          )}
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
            {user ? (
              <>
                <Link href="/admin" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                <div className="flex items-center gap-2 border-t pt-3">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full justify-start gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Sign In</Link>
                <Button asChild size="sm" className="w-full border-0 bg-primary text-primary-foreground shadow-sm"><Link href="/signup" onClick={() => setMobileOpen(false)}>Get Started</Link></Button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
