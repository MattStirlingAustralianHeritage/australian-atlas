'use client'

import { useEffect, useRef } from 'react'

// Thin reading-progress hairline pinned to the viewport top — articles only.
// Width tracks document scroll via rAF-throttled listener; the bar is
// decorative, so it's aria-hidden and costs nothing when JS is off.
export default function ReadingProgress({ color = 'var(--color-gold)' }) {
  const barRef = useRef(null)

  useEffect(() => {
    let frame = null
    function update() {
      frame = null
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      if (barRef.current) barRef.current.style.transform = `scaleX(${pct})`
    }
    function onScroll() {
      if (frame == null) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame != null) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 60, pointerEvents: 'none' }}>
      <div
        ref={barRef}
        style={{ width: '100%', height: '100%', background: color, transform: 'scaleX(0)', transformOrigin: 'left center', willChange: 'transform' }}
      />
    </div>
  )
}
