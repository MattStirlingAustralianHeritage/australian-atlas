'use client'

import { useState, useEffect } from 'react'
import { VERTICAL_STYLES } from './VerticalBadge'
import { TypographicCard } from './ListingCard'
import { isApprovedImageSource } from '@/lib/image-utils'

export default function CrossVerticalNearby({ lat, lng, currentVertical, listingName, subRegion }) {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lat || !lng) { setLoading(false); return }

    fetch(`/api/nearby?lat=${lat}&lng=${lng}&exclude_vertical=${currentVertical}&limit=6`)
      .then(r => r.json())
      .then(data => {
        setListings(data.listings || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [lat, lng, currentVertical])

  if (loading) {
    return (
      <section style={{ borderTop: '0.5px solid var(--border, #e0dcd4)', paddingTop: '1.5rem', maxWidth: 900, margin: '0 auto', padding: '1.5rem 24px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 180, background: 'var(--bg-2, #f5f2ed)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      </section>
    )
  }

  if (listings.length < 3) return null

  return (
    <section style={{ borderTop: '0.5px solid var(--border, #e0dcd4)', paddingTop: '1.5rem', maxWidth: 900, margin: '0 auto', padding: '1.5rem 24px 48px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-3, #999)', marginBottom: 6, fontFamily: 'var(--font-sans, "DM Sans", sans-serif)' }}>
        {subRegion ? `More in ${subRegion}` : 'Also nearby'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3, #999)', fontFamily: 'var(--font-sans, "DM Sans", sans-serif)', marginBottom: 24 }}>
        From across the Atlas network
      </div>

      <div className="cvn-grid">
        {listings.map(item => {
          const vs = VERTICAL_STYLES[item.vertical] || { bg: '#f0f0f0', text: '#666', label: item.vertical }
          const hasRealImage = isApprovedImageSource(item.image_url)

          return (
            <a
              key={item.id}
              href={item.venue_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', textDecoration: 'none',
                borderRadius: 8, overflow: 'hidden',
                transition: 'transform 0.2s ease',
              }}
            >
              {hasRealImage ? (
                <div style={{ aspectRatio: '3/2', overflow: 'hidden', position: 'relative', borderRadius: 8 }}>
                  <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                </div>
              ) : (
                <TypographicCard
                  name={item.name}
                  vertical={item.vertical}
                  region={item.region}
                  state={item.state}
                  aspectRatio="3/2"
                  showVerticalTag={true}
                />
              )}

              <div style={{ padding: '8px 4px' }}>
                {/* Vertical badge */}
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                  fontSize: 10, fontWeight: 500, backgroundColor: vs.bg, color: vs.text,
                  marginBottom: 4, fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                }}>
                  {vs.label}
                </span>

                <div style={{ fontFamily: 'var(--font-sans, "DM Sans", sans-serif)', fontSize: 13, fontWeight: 500, color: 'var(--text, #1a1a1a)', marginBottom: 2, lineHeight: 1.3 }}>
                  {item.name}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-sans, "DM Sans", sans-serif)', fontSize: 11, fontWeight: 300, color: 'var(--text-3, #999)' }}>
                    {item.region || item.state}
                  </span>
                  <span style={{ fontFamily: 'var(--font-sans, "DM Sans", sans-serif)', fontSize: 11, fontWeight: 300, color: 'var(--text-3, #999)' }}>
                    {item.distance_km < 1 ? '<1' : item.distance_km} km
                  </span>
                </div>
              </div>
            </a>
          )
        })}
      </div>

      <style>{`
        .cvn-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 768px) { .cvn-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 480px) { .cvn-grid { grid-template-columns: 1fr !important; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </section>
  )
}
