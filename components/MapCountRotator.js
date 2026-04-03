'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

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

const VERTICAL_MAP_SLUGS = {
  sba: 'small-batch',
  rest: 'rest',
  craft: 'craft',
  collection: 'collections',
  fine_grounds: 'fine-grounds',
  field: 'field',
  found: 'found',
  table: 'table',
  corner: 'corner',
}

export default function MapCountRotator({ verticalCounts, totalListings }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const intervalRef = useRef(null)

  // Build phrases from real data, skipping zero-count verticals
  const entries = Object.entries(VERTICAL_PHRASES)
    .filter(([key]) => verticalCounts[key] > 0)
    .map(([key, fn]) => ({
      text: fn(verticalCounts[key].toLocaleString()),
      href: `/map?vertical=${VERTICAL_MAP_SLUGS[key]}`,
    }))

  useEffect(() => {
    if (entries.length <= 1) return

    intervalRef.current = setInterval(() => {
      // Fade out
      setVisible(false)

      // After fade-out, switch text and fade in
      setTimeout(() => {
        setActiveIndex(prev => (prev + 1) % entries.length)
        setVisible(true)
      }, 400)
    }, 2500)

    return () => clearInterval(intervalRef.current)
  }, [entries.length])

  // Fallback if no data
  if (entries.length === 0) {
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
    <Link
      href={entries[activeIndex]?.href || '/map'}
      className="text-[var(--color-ink)] text-center block cursor-pointer hover:underline hover:underline-offset-4 transition-all"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 400,
        fontSize: 'clamp(28px, 4vw, 40px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease-in-out',
        textDecorationColor: '#C4603A',
      }}
    >
      {entries[activeIndex]?.text}
    </Link>
  )
}
