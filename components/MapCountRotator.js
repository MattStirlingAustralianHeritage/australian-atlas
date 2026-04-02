'use client'

import { useState, useEffect, useRef } from 'react'

const VERTICAL_PHRASES = {
  sba:          (n) => `${n} craft breweries, distilleries and cellar doors`,
  rest:         (n) => `${n} boutique stays, farm retreats and glamping`,
  craft:        (n) => `${n} makers, artists and studios`,
  collection:   (n) => `${n} museums, galleries and cultural centres`,
  fine_grounds: (n) => `${n} specialty roasters and independent cafes`,
  field:        (n) => `${n} natural places, lookouts and swimming holes`,
  found:        (n) => `${n} vintage stores, op shops and weekend markets`,
  table:        (n) => `${n} farm gates, providores and food producers`,
  corner:       (n) => `${n} independent bookshops and record stores`,
}

export default function MapCountRotator({ verticalCounts, totalListings }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const intervalRef = useRef(null)

  // Build phrases from real data, skipping zero-count verticals
  const phrases = Object.entries(VERTICAL_PHRASES)
    .filter(([key]) => verticalCounts[key] > 0)
    .map(([key, fn]) => fn(verticalCounts[key].toLocaleString()))

  useEffect(() => {
    if (phrases.length <= 1) return

    intervalRef.current = setInterval(() => {
      // Fade out
      setVisible(false)

      // After fade-out, switch text and fade in
      setTimeout(() => {
        setActiveIndex(prev => (prev + 1) % phrases.length)
        setVisible(true)
      }, 400)
    }, 2500)

    return () => clearInterval(intervalRef.current)
  }, [phrases.length])

  // Fallback if no data
  if (phrases.length === 0) {
    return (
      <h2
        className="text-[var(--color-ink)] text-center"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(28px, 4vw, 40px)' }}
      >
        {totalListings > 0
          ? `${totalListings.toLocaleString()} independent places across Australia`
          : 'Every listing on one map'}
      </h2>
    )
  }

  return (
    <h2
      className="text-[var(--color-ink)] text-center"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 400,
        fontSize: 'clamp(28px, 4vw, 40px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease-in-out',
      }}
    >
      {phrases[activeIndex]}
    </h2>
  )
}
