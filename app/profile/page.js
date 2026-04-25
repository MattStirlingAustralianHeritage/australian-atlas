'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getListingRegion } from '@/lib/regions'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export default function ProfilePage() {
  const [visits, setVisits] = useState([])
  const [saves, setSaves] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/user/visits').then(r => r.json()).catch(() => ({ visits: [] })),
      fetch('/api/user/saves').then(r => r.json()).catch(() => ({ saves: [] })),
    ]).then(([v, s]) => {
      setVisits(v.visits || [])
      setSaves(s.saves || [])
      setLoading(false)
    })
  }, [])

  // Compute passport stats
  const visitedListings = visits.map(v => v.listing).filter(Boolean)
  const savedListings = saves.map(s => s.listing).filter(Boolean)
  const allListings = [...visitedListings, ...savedListings]

  const regionsExplored = new Set(allListings.map(l => getListingRegion(l)?.name).filter(Boolean))
  const verticalsEngaged = new Set(allListings.map(l => l.vertical).filter(Boolean))

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Passport header */}
      <section style={{ padding: '5rem 1.5rem 2rem', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          Your Atlas
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '2.25rem',
          color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: '1rem',
        }}>
          Atlas Passport
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15,
          color: 'var(--color-muted)', lineHeight: 1.5,
        }}>
          Your personal record of independent Australia.
        </p>
      </section>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)' }}>Loading your passport...</p>
        </div>
      ) : (
        <>
          {/* Stats summary */}
          <section style={{ padding: '0 1.5rem 2rem', maxWidth: '720px', margin: '0 auto' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
              padding: '28px 24px', borderRadius: 12,
              background: 'var(--color-ink)', color: '#fff',
            }}>
              {[
                { n: visitedListings.length, label: 'Places visited' },
                { n: savedListings.length, label: 'Places saved' },
                { n: regionsExplored.size, label: 'Regions explored' },
                { n: verticalsEngaged.size, label: 'Atlases engaged' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#fff', margin: 0 }}>{s.n}</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Vertical engagement */}
          {verticalsEngaged.size > 0 && (
            <section style={{ padding: '0 1.5rem 2rem', maxWidth: '720px', margin: '0 auto' }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--color-sage)', marginBottom: 10,
              }}>
                Atlases explored
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...verticalsEngaged].map(v => (
                  <span key={v} style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    padding: '4px 12px', borderRadius: 100,
                    background: 'var(--color-cream)', color: 'var(--color-ink)',
                    border: '1px solid var(--color-border)',
                  }}>
                    {VERTICAL_NAMES[v] || v}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Visited places */}
          {visitedListings.length > 0 && (
            <section style={{ padding: '0 1.5rem 2rem', maxWidth: '720px', margin: '0 auto' }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--color-sage)', marginBottom: 10,
              }}>
                Places visited
              </p>
              <div style={{ display: 'grid', gap: 6 }}>
                {visitedListings.map(l => (
                  <div key={l.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 6,
                    border: '1px solid var(--color-border)', background: '#fff',
                  }}>
                    <div>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>{l.name}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginLeft: 8 }}>
                        {getListingRegion(l)?.name || l.suburb}, {l.state}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--color-sage)',
                    }}>
                      {VERTICAL_NAMES[l.vertical] || l.vertical}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Saved places */}
          {savedListings.length > 0 && (
            <section style={{ padding: '0 1.5rem 2rem', maxWidth: '720px', margin: '0 auto' }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--color-sage)', marginBottom: 10,
              }}>
                Wishlist
              </p>
              <div style={{ display: 'grid', gap: 6 }}>
                {savedListings.map(l => (
                  <div key={l.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 6,
                    border: '1px solid var(--color-border)', background: '#fff',
                  }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>{l.name}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{getListingRegion(l)?.name || l.suburb}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {visitedListings.length === 0 && savedListings.length === 0 && (
            <section style={{ textAlign: 'center', padding: '2rem 1.5rem 4rem', maxWidth: '720px', margin: '0 auto' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-muted)', marginBottom: 16 }}>
                Your passport is empty. Start exploring to build your record.
              </p>
              <Link
                href="/explore"
                style={{
                  display: 'inline-block', padding: '12px 28px', borderRadius: 6,
                  background: 'var(--color-ink)', color: '#fff',
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                Start exploring
              </Link>
            </section>
          )}

          {/* Privacy note */}
          <section style={{ padding: '2rem 1.5rem 5rem', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
              color: 'var(--color-muted)', opacity: 0.6,
            }}>
              Your passport is private. No public profiles, no social features. Your data can be exported or deleted at any time.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
