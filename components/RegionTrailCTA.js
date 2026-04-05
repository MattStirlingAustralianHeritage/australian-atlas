'use client'

import { useState } from 'react'
import TrailQuestionFlow from './TrailQuestionFlow'

/**
 * Trail CTA card for region pages.
 * Opens the preferences modal with the region name pre-filled as a fixed destination.
 */
export default function RegionTrailCTA({ regionName }) {
  const [showFlow, setShowFlow] = useState(false)

  return (
    <>
      <div
        style={{
          margin: '1rem 0 4rem',
          padding: '2.5rem',
          borderRadius: '14px',
          background: '#FAF8F5',
          border: '1px solid var(--color-border)',
          textAlign: 'center',
        }}
      >
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
          color: 'var(--color-ink)',
          margin: '0 0 0.5rem',
        }}>
          Planning a trip to {regionName}?
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: '15px',
          color: 'var(--color-muted)',
          maxWidth: '480px',
          margin: '0 auto 1.5rem',
          lineHeight: 1.6,
        }}>
          Build a day-by-day itinerary from verified venues across all nine atlases.
        </p>
        <button
          onClick={() => setShowFlow(true)}
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '14px',
            padding: '0.75rem 2rem',
            borderRadius: '8px',
            background: 'var(--color-ink, #2D2A26)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          Build trail &rarr;
        </button>
      </div>

      {showFlow && (
        <TrailQuestionFlow
          query={`Explore ${regionName}`}
          regionName={regionName}
          onClose={() => setShowFlow(false)}
        />
      )}
    </>
  )
}
