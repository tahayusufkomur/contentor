'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface ParallaxProps {
  children: ReactNode
  /**
   * Translate multiplier. 0 = static, 0.3 = slow drift, 1 = matches scroll.
   * Negative values move the element opposite to scroll direction.
   */
  speed?: number
  className?: string
}

/**
 * Lightweight scroll-linked parallax for ambient layers (aurora, glow halos,
 * decorative orbs). Uses a single rAF loop and only updates when the element
 * is in view, so it's cheap enough to layer freely.
 */
export function Parallax({ children, speed = 0.3, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let ticking = false
    let inView = false

    const update = () => {
      ticking = false
      if (!inView) return
      const rect = el.getBoundingClientRect()
      const viewportH = window.innerHeight || 1
      // Progress: 0 when element top is at viewport bottom, 1 when at top.
      const progress = 1 - (rect.top + rect.height / 2) / viewportH
      const offset = progress * 100 * speed
      el.style.setProperty('transform', `translate3d(0, ${offset}px, 0)`)
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting
        if (inView) onScroll()
      },
      { threshold: 0 },
    )
    observer.observe(el)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    update()

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [speed])

  return (
    <div ref={ref} className={className} style={{ willChange: 'transform' }}>
      {children}
    </div>
  )
}
