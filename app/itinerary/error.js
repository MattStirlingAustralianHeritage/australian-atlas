'use client'

/**
 * Route-level error boundary for /itinerary.
 * Lives in a SEPARATE module from page.js, so it catches errors
 * even when the page module fails to evaluate/hydrate.
 *
 * Next.js renders this automatically when any error occurs
 * in the page component tree.
 */

import { useEffect } from 'react'

export default function ItineraryError({ error, reset }) {
  useEffect(() => {
    console.error('[Itinerary Error Boundary]', error)
  }, [error])

  return (
    <div style={{
      maxWidth: 600,
      margin: '0 auto',
      padding: '64px 24px',
      textAlign: 'center',
    }}>
      <h2 style={{
        fontFamily: 'var(--font-display, Georgia, serif)',
        fontWeight: 400,
        fontSize: 22,
        color: 'var(--color-ink, #1C1A17)',
        marginBottom: 8,
      }}>
        Something went wrong
      </h2>
      <p style={{
        fontFamily: 'var(--font-body, system-ui, sans-serif)',
        fontWeight: 300,
        fontSize: 14,
        color: 'var(--color-muted, #6B6760)',
        marginBottom: 24,
        lineHeight: 1.6,
      }}>
        We hit a snag loading the trail builder. This has been logged.
      </p>

      {/* Show error detail for debugging */}
      {error?.message && (
        <p style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#c53030',
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 20,
          wordBreak: 'break-all',
          textAlign: 'left',
        }}>
          {error.message}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          onClick={() => reset()}
          style={{
            fontFamily: 'var(--font-body, system-ui, sans-serif)',
            fontWeight: 500,
            fontSize: 13,
            color: '#fff',
            background: 'var(--color-sage, #5f8a7e)',
            border: 'none',
            padding: '10px 24px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            fontFamily: 'var(--font-body, system-ui, sans-serif)',
            fontWeight: 500,
            fontSize: 13,
            color: 'var(--color-sage, #5f8a7e)',
            textDecoration: 'none',
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
          }}
        >
          Go home
        </a>
      </div>
    </div>
  )
}
