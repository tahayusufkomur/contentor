import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium tracking-[-0.005em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-foreground text-background',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border/70 bg-background/40 backdrop-blur-md text-foreground',
        success: 'border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
        warning: 'border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-300',
        brand:
          'border-primary/15 bg-primary/[0.08] text-primary backdrop-blur-md',
        accent:
          'border-transparent bg-accent/15 text-accent backdrop-blur-md',
        glass:
          'glass text-foreground border-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
