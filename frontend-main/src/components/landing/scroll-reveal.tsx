'use client'

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'

type Direction = 'up' | 'down' | 'left' | 'right' | 'fade'
type Variant = 'translate' | 'scale' | 'zoom' | 'blur'

const directionMap: Record<Direction, { x: string; y: string }> = {
  up: { x: '0', y: '32px' },
  down: { x: '0', y: '-24px' },
  left: { x: '32px', y: '0' },
  right: { x: '-32px', y: '0' },
  fade: { x: '0', y: '0' },
}

interface ScrollRevealProps {
  children: ReactNode
  className?: string
  direction?: Direction
  /** Animation flavor. Defaults to a soft translate + fade. */
  variant?: Variant
  /** Seconds */
  delay?: number
  /** Seconds. Defaults to 1.0 — apple-marketing-page ease. */
  duration?: number
  /** Scale starting value (only used by `scale`). */
  fromScale?: number
  /** IntersectionObserver threshold. */
  threshold?: number
  /** rootMargin to trigger earlier or later. */
  rootMargin?: string
  /** Once means it doesn't replay on re-enter. */
  once?: boolean
}

export function ScrollReveal({
  children,
  className,
  direction = 'up',
  variant = 'translate',
  delay = 0,
  duration = 1,
  fromScale = 0.94,
  threshold = 0.12,
  rootMargin = '0px 0px -8% 0px',
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          if (once) observer.unobserve(el)
        } else if (!once) {
          el.classList.remove('visible')
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, threshold, rootMargin])

  const { x, y } = directionMap[direction]
  const style: CSSProperties = {
    '--reveal-x': x,
    '--reveal-y': y,
    '--reveal-delay': `${delay}s`,
    '--reveal-duration': `${duration}s`,
    '--reveal-from-scale': fromScale,
  } as CSSProperties

  return (
    <div
      ref={ref}
      data-variant={variant === 'translate' ? undefined : variant}
      className={`animate-on-scroll ${className ?? ''}`}
      style={style}
    >
      {children}
    </div>
  )
}
