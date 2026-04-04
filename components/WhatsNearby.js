'use client'

import { useState, useEffect } from 'react'
import { VERTICAL_STYLES } from './VerticalBadge'

/**
 * WhatsNearby — Cross-vertical "What's Nearby" component for the Australian Atlas portal.
 *
 * Shows listings from OTHER verticals near the current venue,
 * grouped by vertical name. Fetches from the portal's /api/nearby endpoint.
 *
 * Props:
 *   lat           — Latitude of the current venue
 *   lng           — Longitude of the current venue
 *   excludeVertical — The calling vertical's key (e.g. 'sba') to exclude from results
 *   portalUrl     — Base URL for the portal API (default: '' for same-origin)
 *   limitPerVertical — Max listings per vertical group (default: 3)
 */
export default function WhatsNearby({
  lat,
  lng,
  excludeVertical,
  portalUrl = '',
  limitPerVertical = 3,
}) {
  const [verticals, setVerticals] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lat || !lng) { setLoading(false); return }

    const base = portalUrl.replace(/\/$/, '')
    const url = `${base}/api/nearby?lat=${lat}&lng=${lng}&exclude_vertical=${excludeVertical}&group_by_vertical=true&limit_per_vertical=${limitPerVertical}`

    fetch(url)
      .then(r => r.json())
      .then(data => {
        setVerticals(data.verticals || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [lat, lng, excludeVertical, portalUrl, limitPerVertical])

  if (loading) {
    return (
      <section style={{ borderTop: '0.5px solid var(--border, #e0dcd4)', maxWidth: 900, margin: '0 auto', padding: '1.5rem 24px 48px' }}>
        <div className="wn-grid">
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 180, background: 'var(--bg-2, #f5f2ed)', borderRadius: 4, animation: 'wnPulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <style>{`
          .wn-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
          @keyframes wnPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          @media (max-width: 768px) { .wn-grid { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (max-width: 480px) { .wn-grid { grid-template-columns: 1fr !important; } }
        `}</style>
      </section>
    )
  }

  // Nothing to show
  if (!verticals || Object.keys(verticals).length === 0) return null

  const verticalKeys = Object.keys(verticals)

  return (
    <section style={{ borderTop: '0.5px solid var(--border, #e0dcd4)', maxWidth: 900, margin: '0 auto', padding: '1.5rem 24px 48px' }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--text-3, #999)',
        marginBottom: 6,
        fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
      }}>
        What's Nearby
      </div>
      <div style={{
        fontSize: 13,
        color: 'var(--text-3, #999)',
        fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
        marginBottom: 28,
      }}>
        From across the Atlas network
      </div>

      {verticalKeys.map(vKey => {
        const group = verticals[vKey]
        const vs = VERTICAL_STYLES[vKey] || { bg: '#f0f0f0', text: '#666', label: vKey }
        const listings = group.listings || []
        if (listings.length === 0) return null

        return (
          <div key={vKey} style={{ marginBottom: 32 }}>
            {/* Vertical group header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
            }}>
              <span style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 500,
                backgroundColor: vs.bg,
                color: vs.text,
                fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
              }}>
                {group.label || vs.label}
              </span>
            </div>

            {/* Listing cards */}
            <div className="wn-grid">
              {listings.map(item => (
                <a
                  key={item.id}
                  href={item.venue_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    background: 'var(--bg, #fff)',
                    border: '1px solid var(--border, #e0dcd4)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    transition: 'border-color 0.2s ease',
                  }}
                >
                  {/* Image or initial fallback */}
                  <div style={{ aspectRatio: '3/2', background: vs.bg, overflow: 'hidden', position: 'relative' }}>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 36, fontWeight: 300, color: vs.text, opacity: 0.4, fontFamily: 'var(--font-serif, "Playfair Display", serif)' }}>
                          {item.name?.charAt(0) || '?'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '10px 12px' }}>
                    {/* Venue name */}
                    <div style={{
                      fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--text, #1a1a1a)',
                      marginBottom: 4,
                      lineHeight: 1.3,
                    }}>
                      {item.name}
                    </div>

                    {/* Location + distance */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                        fontSize: 12,
                        fontWeight: 300,
                        color: 'var(--text-3, #999)',
                      }}>
                        {item.region || item.state}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                        fontSize: 12,
                        fontWeight: 300,
                        color: 'var(--text-3, #999)',
                      }}>
                        {item.distance_km < 1 ? '<1' : item.distance_km} km
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )
      })}

      <style>{`
        .wn-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @keyframes wnPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @media (max-width: 768px) { .wn-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 480px) { .wn-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  )
}
