'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ListingCard from '@/components/ListingCard'
import { getListingRegion } from '@/lib/regions'

const PAGE_SIZE = 50

export default function SavedListingsPage() {
  const [saves, setSaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    let cancelled = false
    fetch('/api/user/saves')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setSaves(Array.isArray(data?.saves) ? data.saves : [])
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleUnsave = useCallback(async (listingId) => {
    const previous = saves
    setSaves(prev => prev.filter(s => s.listing_id !== listingId))
    try {
      const res = await fetch('/api/user/saves', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId }),
      })
      if (!res.ok) throw new Error('unsave failed')
    } catch {
      setSaves(previous)
    }
  }, [saves])

  // Build region-grouped sections from the visible slice. Saves come
  // back ordered by saved_at desc, so within each region the order is
  // already most-recent-first; grouping preserves that.
  const sections = useMemo(() => {
    const visible = saves.slice(0, visibleCount)
    const map = new Map()
    for (const save of visible) {
      const region = getListingRegion(save.listing)
      const key = region?.slug || 'unknown'
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: region?.name || 'Other',
          state: region?.state || '',
          slug: region?.slug || null,
          items: [],
        })
      }
      map.get(key).items.push(save)
    }
    return Array.from(map.values())
  }, [saves, visibleCount])

  const hasMore = saves.length > visibleCount

  return (
    <div style={{
      minHeight: '80vh',
      background: 'var(--color-cream)',
      padding: '3rem 1.5rem',
    }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <Link
            href="/account"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'var(--color-muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: '0.75rem',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            Account
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 600,
            color: 'var(--color-ink)',
            margin: 0,
          }}>
            Saved listings
          </h1>
          {!loading && saves.length > 0 && (
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              color: 'var(--color-muted)',
              margin: '0.5rem 0 0',
            }}>
              {saves.length} {saves.length === 1 ? 'place' : 'places'}
            </p>
          )}
        </div>

        {loading ? (
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
            Loading…
          </p>
        ) : saves.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {sections.map(section => (
              <section key={section.key} style={{ marginBottom: '2.5rem' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  <h2 style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.25rem',
                    fontWeight: 400,
                    color: 'var(--color-ink)',
                    margin: 0,
                  }}>
                    {section.name}
                    {section.state && (
                      <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginLeft: 8, letterSpacing: '0.04em' }}>
                        {section.state}
                      </span>
                    )}
                  </h2>
                  {section.slug && (
                    <Link
                      href={`/regions/${section.slug}`}
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.8rem',
                        color: 'var(--color-sage)',
                        textDecoration: 'none',
                      }}
                    >
                      Explore region →
                    </Link>
                  )}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: 16,
                }}>
                  {section.items.map(save => (
                    <SavedCard
                      key={save.listing_id}
                      listing={save.listing}
                      onUnsave={() => handleUnsave(save.listing_id)}
                    />
                  ))}
                </div>
              </section>
            ))}

            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    padding: '0.7rem 1.5rem',
                    borderRadius: 8,
                    border: '1px solid var(--color-sage)',
                    background: '#fff',
                    color: 'var(--color-sage)',
                    cursor: 'pointer',
                  }}
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SavedCard({ listing, onUnsave }) {
  const [removing, setRemoving] = useState(false)
  if (!listing) return null

  function handleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (removing) return
    setRemoving(true)
    onUnsave()
  }

  return (
    <div style={{ position: 'relative' }}>
      <ListingCard listing={listing} />
      <button
        onClick={handleClick}
        disabled={removing}
        aria-label={`Remove ${listing.name} from saved listings`}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'rgba(255, 255, 255, 0.92)',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          borderRadius: 999,
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: removing ? 'default' : 'pointer',
          opacity: removing ? 0.4 : 1,
          transition: 'opacity 0.15s, background 0.15s',
          backdropFilter: 'blur(6px)',
          padding: 0,
        }}
        onMouseEnter={e => { if (!removing) e.currentTarget.style.background = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.92)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      padding: '3rem 2rem',
      textAlign: 'center',
    }}>
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.25rem',
        fontWeight: 400,
        color: 'var(--color-ink)',
        margin: '0 0 0.5rem',
      }}>
        You haven&rsquo;t saved anything yet.
      </p>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.9rem',
        color: 'var(--color-muted)',
        margin: '0 0 1.5rem',
      }}>
        Start exploring.
      </p>
      <Link
        href="/explore"
        style={{
          display: 'inline-block',
          padding: '0.7rem 1.5rem',
          borderRadius: 8,
          background: 'var(--color-ink)',
          color: '#fff',
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        Explore the network
      </Link>
    </div>
  )
}
