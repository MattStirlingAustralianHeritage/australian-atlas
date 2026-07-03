'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

// The per-vertical rotator phrases live in the "home" message namespace, keyed
// by vertical, each interpolating the live count {n}.
const VERTICAL_PHRASE_KEYS = {
  sba:          'rotatorSba',
  rest:         'rotatorRest',
  craft:        'rotatorCraft',
  collection:   'rotatorCollection',
  fine_grounds: 'rotatorFineGrounds',
  field:        'rotatorField',
  found:        'rotatorFound',
  table:        'rotatorTable',
  corner:       'rotatorCorner',
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
  const t = useTranslations('home')
  const [activeIndex, setActiveIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const intervalRef = useRef(null)

  // Build phrases from real data, skipping zero-count verticals
  const entries = Object.entries(VERTICAL_PHRASE_KEYS)
    .filter(([key]) => verticalCounts[key] > 0)
    .map(([key, msgKey]) => ({
      text: t(msgKey, { n: verticalCounts[key].toLocaleString() }),
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
          ? t('rotatorFallbackCount', { n: totalListings.toLocaleString() })
          : t('rotatorFallbackEmpty')}
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
