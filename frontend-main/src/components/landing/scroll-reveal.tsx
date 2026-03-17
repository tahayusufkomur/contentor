'use client'

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'

type Direction = 'up' | 'down' | 'left' | 'right' | 'fade'

const directionMap: Record<Direction, { x: string; y: string }> = {
  up: { x: '0', y: '20px' },
  down: { x: '0', y: '-20px' },
  left: { x: '20px', y: '0' },
  right: { x: '-20px', y: '0' },
  fade: { x: '0', y: '0' },
}

export function ScrollReveal({
  children,
  className,
  direction = 'up',
  delay = 0,
  duration = 0.7,
}: {
  children: ReactNode
  className?: string
  direction?: Direction
  delay?: number
  duration?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          observer.unobserve(el)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { x, y } = directionMap[direction]
  const style: CSSProperties = {
    '--reveal-x': x,
    '--reveal-y': y,
    '--reveal-delay': `${delay}s`,
    '--reveal-duration': `${duration}s`,
  } as CSSProperties

  return (
    <div ref={ref} className={`animate-on-scroll ${className ?? ''}`} style={style}>
      {children}
    </div>
  )
}
