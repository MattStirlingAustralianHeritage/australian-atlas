'use client'
import { useEffect, useRef } from 'react'

export default function useScrollReveal({ threshold = 0.15, stagger = 80 } = {}) {
  const containerRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const targets = el.querySelectorAll('.reveal')
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const target = entry.target
          const index = parseInt(target.dataset.revealIndex || '0', 10)
          setTimeout(() => {
            target.classList.add('revealed')
          }, index * stagger)
          observer.unobserve(target)
        })
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )

    targets.forEach((target, i) => {
      if (!target.dataset.revealIndex) target.dataset.revealIndex = i
      observer.observe(target)
    })

    return () => observer.disconnect()
  }, [threshold, stagger])

  return containerRef
}
