'use client'
import { useEffect, useRef } from 'react'

export default function ScrollReveal({ children, className = '', stagger = 80, threshold = 0.12, as: Tag = 'div', ...props }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const targets = el.querySelectorAll('.reveal')
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const target = entry.target
          const index = parseInt(target.dataset.revealIndex || '0', 10)
          setTimeout(() => target.classList.add('revealed'), index * stagger)
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

  return <Tag ref={ref} className={className} {...props}>{children}</Tag>
}
