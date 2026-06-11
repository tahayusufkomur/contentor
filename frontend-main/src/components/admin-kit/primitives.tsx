'use client'

// Shared admin-kit (schema-driven admin renderer).
// Canonical copy: frontend-customer. After editing, run scripts/sync-admin-kit.sh
// to mirror into frontend-main — the two copies must stay byte-identical.
//
// Self-contained controls styled with the design-token classes both apps
// define (bg-card, text-muted-foreground, …) — no per-app UI imports, so the
// kit renders identically in either panel.

import { forwardRef } from 'react'
import {
  BookOpen,
  Building2,
  CreditCard,
  Database,
  Package,
  Receipt,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  'building-2': Building2,
  'credit-card': CreditCard,
  database: Database,
  package: Package,
  receipt: Receipt,
  users: Users,
  webhook: Webhook,
}

export function kitIcon(name: string): LucideIcon {
  return ICONS[name] ?? Database
}

type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: 'border bg-card text-foreground hover:bg-muted',
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  danger: 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
}

export function KitButton({
  variant = 'default',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

const CONTROL =
  'h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

export const KitInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function KitInput({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${CONTROL} ${className}`} {...props} />
  },
)

export function KitTextarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${CONTROL} h-auto min-h-[5.5rem] py-2 font-[inherit] ${className}`}
      {...props}
    />
  )
}

export function KitSelect({
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} appearance-none pr-8 ${className}`} {...props} />
}

export function KitToggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function KitBanner({
  kind,
  message,
  onDismiss,
}: {
  kind: 'success' | 'error'
  message: string
  onDismiss: () => void
}) {
  const tone =
    kind === 'error'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-primary/30 bg-primary/10 text-foreground'
  return (
    <div className={`flex items-start justify-between gap-3 rounded-md border px-4 py-2.5 text-sm ${tone}`}>
      <p>{message}</p>
      <button type="button" onClick={onDismiss} className="font-medium opacity-70 hover:opacity-100">
        ✕
      </button>
    </div>
  )
}

export function KitSkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  )
}
