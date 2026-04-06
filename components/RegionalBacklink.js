'use client'

import { useState, useEffect } from 'react'

export default function RegionalBacklink({ regionName, regionSlug, regionDescription, venueName }) {
  const [regionValid, setRegionValid] = useState(false)

  useEffect(() => {
    if (!regionName || !regionSlug) return

    fetch(`/api/regions/validate?slug=${regionSlug}`)
      .then(r => r.ok ? r.json() : { exists: false })
      .then(data => setRegionValid(data.exists === true))
      .catch(() => setRegionValid(false))
  }, [regionSlug, regionName])

  if (!regionName || !regionSlug || !regionValid) return null

  // Take just the first sentence of the region description
  const snippet = regionDescription
    ? regionDescription.split(/(?<=[.!?])\s+/)[0]
    : null

  return (
    <div style={{
      maxWidth: 900,
      margin: '0 auto',
      padding: '0 24px 48px',
    }}>
      <div style={{
        background: 'var(--bg-2, #f5f2ed)',
        borderRadius: 8,
        padding: '1.5rem 2rem',
      }}>
        <p style={{
          fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
          fontSize: 14,
          fontWeight: 300,
          color: 'var(--text-2, #555)',
          lineHeight: 1.6,
          margin: '0 0 8px',
        }}>
          <span style={{ fontFamily: 'var(--font-serif, "Playfair Display", serif)', fontWeight: 400 }}>{venueName}</span>
          {' '}is part of our{' '}
          <span style={{ fontFamily: 'var(--font-serif, "Playfair Display", serif)', fontWeight: 400 }}>{regionName}</span>
          {' '}guide
        </p>

        {snippet && (
          <p style={{
            fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
            fontSize: 13,
            fontWeight: 300,
            color: 'var(--text-3, #999)',
            lineHeight: 1.6,
            margin: '0 0 12px',
          }}>
            {snippet}
          </p>
        )}

        <a
          href={`https://australianatlas.com.au/regions/${regionSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
            fontSize: 13,
            fontWeight: 500,
            color: '#C4603A',
            textDecoration: 'none',
          }}
        >
          Explore the full {regionName} guide &rarr;
        </a>
      </div>
    </div>
  )
}
