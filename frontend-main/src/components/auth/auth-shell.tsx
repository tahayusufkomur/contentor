import Link from 'next/link'
import { Wordmark } from '@/components/shared/logo-mark'

interface AuthShellProps {
  eyebrow?: string
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

/**
 * Apple Vision-Pro style auth shell:
 * left → brand panel with aurora & quote; right → floating glass form.
 * On mobile, collapses to a single centered glass panel over aurora.
 */
export function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Aurora backdrop */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="aurora animate-aurora" />
        <div className="grid-fade absolute inset-0 opacity-50" />
      </div>

      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
        {/* Brand panel */}
        <aside className="relative hidden flex-col justify-between p-12 lg:flex">
          <Link href="/" className="inline-flex items-center">
            <Wordmark className="text-lg" />
          </Link>

          <div className="relative max-w-md">
            <div
              aria-hidden
              className="absolute -inset-x-16 -top-24 -z-10 h-72 rounded-full bg-gradient-to-r from-[oklch(0.62_0.24_232)] via-[oklch(0.55_0.24_270)] to-[oklch(0.7_0.2_210)] opacity-30 blur-3xl"
            />
            <p className="text-eyebrow text-muted-foreground/80">For creators</p>
            <h2 className="text-display mt-4 text-5xl leading-[1.05]">
              <span className="text-foreground/95">Your studio.</span>
              <br />
              <span className="brand-gradient">Your brand.</span>
            </h2>
            <p className="mt-5 text-[15.5px] leading-relaxed text-muted-foreground">
              Launch a beautifully designed platform for courses, live classes, and
              email — all under your name. No code. No clutter.
            </p>
          </div>

          <p className="text-[12.5px] text-muted-foreground/70">
            © {new Date().getFullYear()} Contentor — All rights reserved.
          </p>
        </aside>

        {/* Form panel */}
        <main className="flex items-center justify-center px-5 py-12 sm:px-8 lg:p-12">
          <div className="w-full max-w-md">
            {/* mobile brand row */}
            <div className="mb-8 flex items-center justify-center lg:hidden">
              <Wordmark className="text-base" />
            </div>

            <div className="glass-pane p-8 md:p-9">
              <div className="text-center">
                {eyebrow && (
                  <p className="text-eyebrow text-muted-foreground/80">{eyebrow}</p>
                )}
                <h1 className="text-display mt-2 text-[28px] leading-[1.1] md:text-[32px]">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>

              <div className="mt-7">{children}</div>
            </div>

            {footer && <div className="mt-6 text-center">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  )
}
