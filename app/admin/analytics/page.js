'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import React, { useState, useEffect, useRef, useCallback } from 'react'
const VERTICALS = [
  { key: 'sba', label: 'Small Batch', color: '#C49A3C' },
  { key: 'collection', label: 'Culture', color: '#8B6F47' },
  { key: 'craft', label: 'Craft', color: '#6B7F5E' },
  { key: 'fine_grounds', label: 'Fine Grounds', color: '#7A5C3E' },
  { key: 'rest', label: 'Rest', color: '#5B7B8A' },
  { key: 'field', label: 'Field', color: '#4A7C59' },
  { key: 'corner', label: 'Corner', color: '#8B6E5A' },
  { key: 'found', label: 'Found', color: '#9B7653' },
  { key: 'table', label: 'Table', color: '#6E5A4E' },
  { key: 'portal', label: 'Portal', color: '#2D3436' },
]

const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: '1y', label: '1 year' },
]

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('30d')
  const [vertical, setVertical] = useState(null)
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ range })
      if (vertical) params.set('vertical', vertical)
      const res = await fetch(`/api/analytics/dashboard?${params}`)
      if (res.ok) {
        setData(await res.json())
      } else {
        console.error('Analytics dashboard returned', res.status, await res.text().catch(() => ''))
        setData({ traffic: [], geo: [], timeline: [], topPages: [] })
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
      setData({ traffic: [], geo: [], timeline: [], topPages: [] })
    }
    setLoading(false)
  }, [range, vertical])

  useEffect(() => { fetchData() }, [fetchData])

  // Animated map with Mapbox
  useEffect(() => {
    if (!data?.geo?.length || !mapRef.current) return
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        center: [134, -28], // Australia center
        zoom: 3.5,
        attributionControl: false,
        interactive: true,
      })

      map.on('load', () => {
        // Add source with geo data
        const features = data.geo.map(point => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
          properties: { count: point.visit_count, city: point.city || '' },
        }))

        map.addSource('visitors', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        })

        // Pulsing circle layer (Ghost-style)
        map.addLayer({
          id: 'visitor-dots',
          type: 'circle',
          source: 'visitors',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'count'],
              1, 4,
              10, 8,
              100, 14,
              1000, 22,
            ],
            'circle-color': '#6B7F5E',
            'circle-opacity': 0.6,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#6B7F5E',
            'circle-stroke-opacity': 0.3,
          },
        })

        // Animated pulse layer (outer ring)
        map.addLayer({
          id: 'visitor-pulse',
          type: 'circle',
          source: 'visitors',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'count'],
              1, 8,
              10, 14,
              100, 22,
              1000, 34,
            ],
            'circle-color': 'transparent',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#6B7F5E',
            'circle-stroke-opacity': 0.2,
          },
        })

        // Animate the pulse
        let opacity = 0.2
        let growing = false
        function animatePulse() {
          opacity += growing ? 0.005 : -0.005
          if (opacity <= 0.05) growing = true
          if (opacity >= 0.25) growing = false
          map.setPaintProperty('visitor-pulse', 'circle-stroke-opacity', opacity)
          requestAnimationFrame(animatePulse)
        }
        animatePulse()

        // Popup on hover
        const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
        map.on('mouseenter', 'visitor-dots', (e) => {
          map.getCanvas().style.cursor = 'pointer'
          const { city, count } = e.features[0].properties
          popup.setLngLat(e.lngLat).setHTML(`
            <div style="font-family: var(--font-sans, system-ui); font-size: 12px; padding: 2px 0;">
              <strong>${city || 'Unknown'}</strong><br/>
              ${count} visit${count !== 1 ? 's' : ''}
            </div>
          `).addTo(map)
        })
        map.on('mouseleave', 'visitor-dots', () => {
          map.getCanvas().style.cursor = ''
          popup.remove()
        })
      })

      mapInstance.current = map
    })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [data?.geo])

  // Calculate totals
  const totals = data?.traffic?.reduce((acc, v) => ({
    pageviews: acc.pageviews + (v.total_pageviews || 0),
    signups: acc.signups + (v.total_signups || 0),
    claims: acc.claims + (v.total_claims || 0),
  }), { pageviews: 0, signups: 0, claims: 0 }) || { pageviews: 0, signups: 0, claims: 0 }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream, #F5F1EB)', fontFamily: 'var(--font-sans, system-ui)' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif, Georgia)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: '0' }}>
            Network Analytics
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #E5E0D8)',
                background: range === r.key ? 'var(--color-ink, #2D2A26)' : 'transparent',
                color: range === r.key ? '#fff' : 'var(--color-muted, #8B8578)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-muted)' }}>
          Loading analytics...
        </div>
      ) : (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <SummaryCard label="Unique Visitors" value={(data?.totalUniqueVisitors || 0).toLocaleString()} />
            <SummaryCard label="Total Pageviews" value={totals.pageviews.toLocaleString()} />
            <SummaryCard label="Signups" value={totals.signups.toLocaleString()} />
            <SummaryCard label="Claims Completed" value={totals.claims.toLocaleString()} />
            <SummaryCard label="Active Verticals" value={data?.traffic?.length || 0} />
          </div>

          {/* Map — Ghost-style animated visitor map */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', overflow: 'hidden', marginBottom: '2rem' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--color-ink)' }}>
                Visitor Origins
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                {data?.geo?.length || 0} locations
              </span>
            </div>
            <div
              ref={mapRef}
              style={{ height: 420, width: '100%' }}
            />
          </div>

          {/* Vertical Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Per-vertical traffic */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', padding: '1.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--color-ink)' }}>
                Traffic by Vertical
              </h2>
              {data?.traffic?.map(v => {
                const config = VERTICALS.find(vt => vt.key === v.vertical) || { label: v.vertical, color: '#888' }
                const pct = totals.pageviews > 0 ? (v.total_pageviews / totals.pageviews * 100) : 0
                return (
                  <div key={v.vertical} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <button
                        onClick={() => setVertical(vertical === v.vertical ? null : v.vertical)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: vertical === v.vertical ? 600 : 400,
                          color: 'var(--color-ink)',
                          fontFamily: 'inherit',
                          textDecoration: vertical === v.vertical ? 'underline' : 'none',
                        }}
                      >
                        {config.label}
                      </button>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {v.unique_visitors ? `${v.unique_visitors.toLocaleString()} · ` : ''}{v.total_pageviews?.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border, #E5E0D8)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: config.color, borderRadius: 2, transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )
              })}
              {(!data?.traffic || data.traffic.length === 0) && (
                <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>No traffic data yet.</p>
              )}
            </div>

            {/* Top Pages */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', padding: '1.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--color-ink)' }}>
                Top Pages
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data?.topPages?.slice(0, 15).map((p, i) => {
                  const config = VERTICALS.find(v => v.key === p.vertical) || { label: p.vertical, color: '#888' }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.375rem 0', borderBottom: i < 14 ? '1px solid var(--color-border, #E5E0D8)' : 'none' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: config.color, minWidth: 60, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {config.label}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.page_path}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {p.count}
                      </span>
                    </div>
                  )
                })}
                {(!data?.topPages || data.topPages.length === 0) && (
                  <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>No page data yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* Geographic Breakdown Table */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--color-ink)' }}>
              Top Locations
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem 1rem', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>City</div>
              <div style={{ fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>Region</div>
              <div style={{ fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>Country</div>
              <div style={{ fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border)', textAlign: 'right' }}>Visits</div>
              {data?.geo?.slice(0, 20).map((loc, i) => (
                <React.Fragment key={`geo-${i}`}>
                  <div style={{ color: 'var(--color-ink)' }}>{loc.city || '—'}</div>
                  <div style={{ color: 'var(--color-muted)' }}>{loc.region || '—'}</div>
                  <div style={{ color: 'var(--color-muted)' }}>{loc.country || '—'}</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{loc.visit_count?.toLocaleString()}</div>
                </React.Fragment>
              ))}
            </div>
            {(!data?.geo || data.geo.length === 0) && (
              <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>No geographic data yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border, #E5E0D8)',
      padding: '1.25rem',
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted, #8B8578)', margin: '0 0 0.375rem' }}>
        {label}
      </p>
      <p style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: 0, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-serif, Georgia)' }}>
        {value}
      </p>
    </div>
  )
}
