import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoMarkProps {
  size?: number
  className?: string
  priority?: boolean
}

/**
 * Crops the empty padding around the brand mark inside /logo.svg so the
 * visible glyph fills the `size` box. The SVG's viewBox is 784×1168 with
 * ~30% empty space top/bottom, so we render it at ~1.6× inside an
 * overflow-hidden frame.
 */
export function LogoMark({ size = 32, className, priority = false }: LogoMarkProps) {
  const rendered = Math.round(size * 1.65)
  return (
    <span
      className={cn('relative inline-flex shrink-0 overflow-hidden', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Image
        src="/logo.svg"
        alt=""
        width={rendered}
        height={rendered}
        priority={priority}
        className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
        style={{ width: rendered, height: rendered }}
      />
    </span>
  )
}
