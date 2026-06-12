'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

export default function ClaimSearch({ totalCount = 0 }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(null)

  // Server-side search across the FULL listings table (see
  // /api/claim/search) — debounced per keystroke. The previous client-side
  // filter only ever saw the first 1000 rows.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/claim/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        })
        const json = await res.json()
        if (!controller.signal.aborted) {
          setResults(Array.isArray(json.results) ? json.results : [])
          setLoading(false)
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setResults([])
          setLoading(false)
        }
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const inputStyle = {
    width: '100%',
    padding: '16px 20px 16px 48px',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    background: '#fff',
    color: 'var(--color-ink)',
    fontFamily: 'var(--font-body)',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div>
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <svg
          style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: 'var(--color-muted)' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by venue name, town, or state..."
          style={inputStyle}
          autoFocus
        />
      </div>

      {/* Results count */}
      {query.trim().length >= 2 && (
        <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 16 }}>
          {loading
            ? 'Searching…'
            : results.length === 0
              ? 'No venues found. Try a different search term.'
              : `${results.length} venue${results.length === 1 ? '' : 's'} found`}
        </p>
      )}

      {/* Results list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map(listing => {
          const location = [listing.region, listing.state].filter(Boolean).join(', ')

          return (
            <Link
              key={listing.id}
              href={listing.isClaimed ? '#' : `/claim/${listing.slug}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: '#fff',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                textDecoration: 'none',
                transition: 'border-color 0.15s',
                opacity: listing.isClaimed ? 0.6 : 1,
                cursor: listing.isClaimed ? 'default' : 'pointer',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: listing.verticalColor,
                    fontFamily: 'var(--font-body)',
                  }}>
                    {listing.verticalLabel}
                  </span>
                  {location && (
                    <span style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                      {location}
                    </span>
                  )}
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 400,
                  color: 'var(--color-ink)',
                  lineHeight: 1.3,
                }}>
                  {listing.name}
                </div>
              </div>
              <div>
                {listing.isClaimed ? (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-muted)',
                    fontFamily: 'var(--font-body)',
                    padding: '5px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                  }}>
                    Claimed
                  </span>
                ) : (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#fff',
                    fontFamily: 'var(--font-body)',
                    padding: '5px 12px',
                    background: 'var(--color-sage)',
                    borderRadius: 4,
                  }}>
                    Claim
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Prompt when empty */}
      {query.trim().length < 2 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
            Start typing to search across {totalCount > 0 ? totalCount.toLocaleString() : 'thousands of'} venues
          </p>
        </div>
      )}
    </div>
  )
}
