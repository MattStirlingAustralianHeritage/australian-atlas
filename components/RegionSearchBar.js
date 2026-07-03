'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Region-scoped entry into Search 3.0. Submits to /search?q=…&region=<slug>,
 * so the full grid / list / map results page opens already filtered to this
 * region. Suggestion chips seed common queries drawn from the region's own
 * active verticals.
 *
 * Props:
 *   regionName: string
 *   suggestions: string[]  — quick query chips (optional)
 */
export default function RegionSearchBar({ regionName, suggestions = [] }) {
  const router = useRouter()
  const [q, setQ] = useState('')

  const go = (query) => {
    const term = (query ?? q).trim()
    const params = new URLSearchParams()
    if (term) params.set('q', term)
    // Region NAME reads cleanly as the /search scope chip and resolves the
    // same as the slug in the search API.
    if (regionName) params.set('region', regionName)
    router.push(`/search?${params}`)
  }

  return (
    <section style={{ padding: '2.25rem 0 0.5rem' }}>
      <div
        style={{
          background: 'var(--color-surface, #faf6ee)',
          border: '1px solid var(--color-border)',
          borderRadius: '14px',
          padding: 'clamp(1.25rem, 3vw, 1.75rem)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--color-muted)', margin: '0 0 0.6rem',
          }}
        >
          Search across {regionName}
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); go() }}
          style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}
        >
          <div
            style={{
              flex: '1 1 260px', display: 'flex', alignItems: 'center', gap: '0.6rem',
              background: '#fff', border: '1px solid var(--color-border)',
              borderRadius: '10px', padding: '0.7rem 0.9rem',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
              <circle cx="11" cy="11" r="7" stroke="#3E3A33" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="#3E3A33" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Wineries, coffee roasters, a quiet stay…"
              aria-label={`Search across ${regionName}`}
              enterKeyHint="search"
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--color-ink)',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              flexShrink: 0, border: 'none', borderRadius: '10px', cursor: 'pointer',
              background: 'var(--color-ink, #2D2A26)', color: '#FBF9F4',
              fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500,
              padding: '0 1.4rem',
            }}
          >
            Search
          </button>
        </form>

        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.85rem' }}>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => go(s)}
                style={{
                  border: '1px solid var(--color-border)', borderRadius: '100px',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '12.5px', fontWeight: 400,
                  color: 'var(--color-ink)', padding: '0.3rem 0.75rem',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
