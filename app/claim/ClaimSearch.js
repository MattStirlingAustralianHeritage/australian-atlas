'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

export default function ClaimSearch({ listings }) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase()
    return listings
      .filter(l =>
        l.name.toLowerCase().includes(q) ||
        (l.region && l.region.toLowerCase().includes(q)) ||
        (l.state && l.state.toLowerCase().includes(q))
      )
      .slice(0, 20)
  }, [query, listings])

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
      {query.length >= 2 && (
        <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 16 }}>
          {results.length === 0
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
      {query.length < 2 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
            Start typing to search across {listings.length.toLocaleString()} venues
          </p>
        </div>
      )}
    </div>
  )
}
