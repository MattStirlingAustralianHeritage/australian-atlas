'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', fine_grounds: '#8A7055', collection: '#7A6B8A',
  craft: '#C1603A', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_ORDER = ['sba', 'fine_grounds', 'collection', 'craft', 'rest', 'field', 'corner', 'found', 'table']

export default function NearMeClient() {
  const [status, setStatus] = useState('prompt')
  const [verticals, setVerticals] = useState(null)
  const [total, setTotal] = useState(0)
  const [radius, setRadius] = useState(15)

  function requestLocation() {
    setStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchNearby(pos.coords.latitude, pos.coords.longitude)
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  async function fetchNearby(lat, lng) {
    try {
      const res = await fetch(`/api/nearby?lat=${lat}&lng=${lng}&group_by_vertical=true&limit_per_vertical=4&radius=${radius}`)
      const data = await res.json()
      setVerticals(data.verticals || {})
      setTotal(data.total || 0)
      setStatus('loaded')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'prompt') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <button
          onClick={requestLocation}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 28px', borderRadius: 100,
            background: 'var(--color-ink)', color: '#fff', border: 'none',
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
          Use my location
        </button>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginTop: 12 }}>
          We never store your location. It stays in your browser.
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)' }}>
          Finding places near you...
        </p>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)' }}>
          Location access was denied. Enable it in your browser settings and refresh.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#c44' }}>
          Something went wrong. Please try again.
        </p>
      </div>
    )
  }

  const activeVerticals = VERTICAL_ORDER.filter(v => verticals?.[v]?.listings?.length > 0)

  if (activeVerticals.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-muted)' }}>
          No listings found within {radius}km. Try a larger area or explore the <Link href="/map" style={{ color: 'var(--color-sage)' }}>full map</Link>.
        </p>
      </div>
    )
  }

  return (
    <>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
        textAlign: 'center', marginBottom: '2rem',
      }}>
        {total} listings within {radius}km across {activeVerticals.length} atlases
      </p>

      {activeVerticals.map(v => {
        const group = verticals[v]
        const color = VERTICAL_COLORS[v] || '#888'
        return (
          <section key={v} style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.25rem',
              color: 'var(--color-ink)', marginBottom: '0.75rem',
            }}>
              {VERTICAL_LABELS[v] || v}
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '0.75rem',
            }}>
              {group.listings.map(listing => (
                <Link
                  key={listing.id}
                  href={listing.venue_url || `/place/${listing.slug}`}
                  style={{
                    display: 'block', padding: '1rem 1.25rem',
                    borderRadius: 10, background: color,
                    textDecoration: 'none', transition: 'transform 0.15s',
                  }}
                >
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1rem',
                    color: '#fff', margin: '0 0 4px', lineHeight: 1.3,
                  }}>
                    {listing.name}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
                    color: 'rgba(255,255,255,0.65)', margin: '0 0 4px',
                  }}>
                    {[listing.region, listing.state].filter(Boolean).join(', ')}
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
                    color: 'rgba(255,255,255,0.5)', margin: 0,
                  }}>
                    {listing.distance_km}km away
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}
