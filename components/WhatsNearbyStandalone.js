'use client'

/**
 * WhatsNearbyStandalone — Drop-in cross-vertical "What's Nearby" component.
 *
 * Copy this file into your vertical's components/ directory and use it on
 * your venue/listing detail page. It fetches from the Australian Atlas portal
 * API and shows nearby listings from OTHER verticals, grouped by vertical.
 *
 * USAGE:
 *   1. Copy this file to your project: components/WhatsNearby.js
 *   2. Import it into your venue page:
 *        import WhatsNearby from '@/components/WhatsNearby'
 *   3. Add it near the bottom of your venue page:
 *        <WhatsNearby
 *          lat={venue.latitude}
 *          lng={venue.longitude}
 *          excludeVertical="sba"   // your vertical key
 *        />
 *
 * VERTICAL KEYS:
 *   sba | collection | craft | fine_grounds | rest | field | corner | found | table
 *
 * OPTIONAL PROPS:
 *   portalUrl        — Override portal base URL (default: 'https://australianatlas.com.au')
 *   limitPerVertical — Max listings per vertical group (default: 3)
 *
 * STYLING:
 *   This component uses CSS custom properties with sensible fallbacks.
 *   It will inherit your site's theme if you define these variables:
 *     --bg, --bg-2, --border, --text, --text-3, --font-sans, --font-serif
 *   If those vars are not set, it falls back to neutral defaults.
 *
 * REQUIREMENTS:
 *   - React 18+ with 'use client' support (Next.js App Router)
 *   - No other dependencies
 */

import { useState, useEffect } from 'react'

const PORTAL_URL = 'https://australianatlas.com.au'

const VERTICAL_STYLES = {
  sba:          { bg: '#EEEDFE', text: '#3C3489', label: 'Small Batch Atlas' },
  collection:   { bg: '#E6F1FB', text: '#185FA5', label: 'Culture Atlas' },
  craft:        { bg: '#E1F5EE', text: '#0F6E56', label: 'Craft Atlas' },
  fine_grounds: { bg: '#FAEEDA', text: '#854F0B', label: 'Fine Grounds Atlas' },
  rest:         { bg: '#FAECE7', text: '#993C1D', label: 'Rest Atlas' },
  field:        { bg: '#EAF3DE', text: '#3B6D11', label: 'Field Atlas' },
  table:        { bg: '#FCEBEB', text: '#A32D2D', label: 'Table Atlas' },
  corner:       { bg: '#FBEAF0', text: '#993556', label: 'Corner Atlas' },
  found:        { bg: '#F1EFE8', text: '#5F5E5A', label: 'Found Atlas' },
}

export default function WhatsNearby({
  lat,
  lng,
  excludeVertical,
  portalUrl = PORTAL_URL,
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

  // Loading skeleton
  if (loading) {
    return (
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 48px' }}>
        <div style={{ borderTop: '0.5px solid var(--border, #e0dcd4)', paddingTop: '1.5rem' }}>
          <div className="whats-nearby-grid">
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 200, background: 'var(--bg-2, #f5f2ed)', borderRadius: 4, animation: 'wnStandalonePulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
        <style>{`
          .whats-nearby-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
          @keyframes wnStandalonePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          @media (max-width: 768px) { .whats-nearby-grid { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (max-width: 480px) { .whats-nearby-grid { grid-template-columns: 1fr !important; } }
        `}</style>
      </section>
    )
  }

  // Render nothing if no results
  if (!verticals || Object.keys(verticals).length === 0) return null

  const verticalKeys = Object.keys(verticals)

  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 48px' }}>
      <div style={{ borderTop: '0.5px solid var(--border, #e0dcd4)', paddingTop: '1.5rem' }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--text-3, #999)', marginBottom: 6,
          fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
        }}>
          What's Nearby
        </div>
        <div style={{
          fontSize: 13, color: 'var(--text-3, #999)', marginBottom: 28,
          fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{
                  display: 'inline-block', padding: '3px 10px', borderRadius: 99,
                  fontSize: 11, fontWeight: 500,
                  backgroundColor: vs.bg, color: vs.text,
                  fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                }}>
                  {group.label || vs.label}
                </span>
              </div>

              {/* Listing cards */}
              <div className="whats-nearby-grid">
                {listings.map(item => (
                  <a
                    key={item.id}
                    href={item.venue_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block', textDecoration: 'none',
                      background: 'var(--bg, #fff)',
                      border: '1px solid var(--border, #e0dcd4)',
                      borderRadius: 4, overflow: 'hidden',
                      transition: 'border-color 0.2s ease',
                    }}
                  >
                    {/* Image or initial fallback */}
                    <div style={{ aspectRatio: '3/2', background: vs.bg, overflow: 'hidden' }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{
                            fontSize: 36, fontWeight: 300, opacity: 0.4,
                            color: vs.text,
                            fontFamily: 'var(--font-serif, "Playfair Display", serif)',
                          }}>
                            {item.name?.charAt(0) || '?'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '10px 12px' }}>
                      {/* Venue name */}
                      <div style={{
                        fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                        fontSize: 14, fontWeight: 500,
                        color: 'var(--text, #1a1a1a)',
                        marginBottom: 4, lineHeight: 1.3,
                      }}>
                        {item.name}
                      </div>

                      {/* Location + distance */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                          fontSize: 12, fontWeight: 300, color: 'var(--text-3, #999)',
                        }}>
                          {item.region || item.state}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                          fontSize: 12, fontWeight: 300, color: 'var(--text-3, #999)',
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
      </div>

      <style>{`
        .whats-nearby-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @keyframes wnStandalonePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @media (max-width: 768px) { .whats-nearby-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 480px) { .whats-nearby-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  )
}
