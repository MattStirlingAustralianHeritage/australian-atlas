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
    // Report error to the server silently
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route: window.location.pathname,
        error_message: error?.message || 'Unknown itinerary error',
        error_stack: error?.stack || null,
      }),
    }).catch(() => {})
  }, [error])

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '440px' }}>
        {/* Flag / report icon */}
        <div style={{ marginBottom: '1.25rem' }}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-muted, #6B6760)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.6 }}
          >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: '1.5rem',
          fontWeight: 400,
          color: 'var(--color-ink, #1C1A17)',
          margin: '0 0 0.5rem 0',
        }}>
          Itinerary hit a snag
        </h1>

        <p style={{
          fontFamily: 'var(--font-body, system-ui, sans-serif)',
          fontSize: '0.9rem',
          fontWeight: 300,
          color: 'var(--color-muted, #6B6760)',
          marginBottom: '1.25rem',
          lineHeight: 1.6,
        }}>
          We couldn't load the itinerary builder. This has been logged and we're looking into it.
        </p>

        {/* Show error detail in development only */}
        {process.env.NODE_ENV === 'development' && error?.message && (
          <p style={{
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            color: '#c53030',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            padding: '8px 12px',
            marginBottom: '1.25rem',
            wordBreak: 'break-all',
            textAlign: 'left',
          }}>
            {error.message}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-ink, #1C1A17)',
              color: '#fff',
              fontFamily: 'var(--font-body, system-ui, sans-serif)',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
              background: 'transparent',
              color: 'var(--color-ink, #1C1A17)',
              fontFamily: 'var(--font-body, system-ui, sans-serif)',
              fontSize: '0.85rem',
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  )
}
