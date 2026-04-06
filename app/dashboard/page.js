'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_URLS = {
  sba:          { base: 'https://smallbatchatlas.com.au',    path: '/venue' },
  collection:   { base: 'https://collectionatlas.com.au',    path: '/venue' },
  craft:        { base: 'https://craftatlas.com.au',         path: '/venue' },
  fine_grounds: { base: 'https://finegroundsatlas.com.au',   path: '/roasters' },
  rest:         { base: 'https://restatlas.com.au',          path: '/stay' },
  field:        { base: 'https://fieldatlas.com.au',         path: '/places' },
  corner:       { base: 'https://corneratlas.com.au',        path: '/shops' },
  found:        { base: 'https://foundatlas.com.au',         path: '/shops' },
  table:        { base: 'https://tableatlas.com.au',         path: '/listings' },
}

const VERTICAL_VENDOR_PATHS = {
  sba:          '/vendor',
  collection:   '/vendor',
  craft:        '/vendor',
  fine_grounds: '/vendor',
  rest:         '/vendor',
  field:        '/vendor',
  corner:       '/vendor',
  found:        '/vendor',
  table:        '/vendor',
}

function getPublicUrl(vertical, slug) {
  const config = VERTICAL_URLS[vertical]
  if (!config) return '#'
  return `${config.base}${config.path}/${slug}`
}

function getVendorDashboardUrl(vertical) {
  const config = VERTICAL_URLS[vertical]
  const vendorPath = VERTICAL_VENDOR_PATHS[vertical] || '/vendor'
  if (!config) return '#'
  return `${config.base}${vendorPath}`
}

function decodeJWT(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload
  } catch {
    return null
  }
}

function ScoreBar({ score }) {
  let color = '#c0392b'
  if (score >= 70) color = 'var(--color-sage, #5f8a7e)'
  else if (score >= 40) color = '#d4a03c'

  return (
    <div style={{
      width: '100%', height: 6, borderRadius: 3,
      background: 'var(--color-border, #e5e5e5)',
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${score}%`, height: '100%', borderRadius: 3,
        background: color,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function ListingCard({ listing }) {
  const score = listing.score
  const stats = listing.stats
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

  const staticMapUrl = listing.lat && listing.lng && mapboxToken
    ? `https://api.mapbox.com/styles/v1/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k/static/pin-s+5f8a7e(${listing.lng},${listing.lat})/${listing.lng},${listing.lat},12,0/320x180@2x?access_token=${mapboxToken}`
    : null

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid var(--color-border, #e5e5e5)',
      overflow: 'hidden',
    }}>
      {/* Mini map */}
      {staticMapUrl && (
        <div style={{ width: '100%', height: 140, overflow: 'hidden', background: '#f5f5f0' }}>
          <img
            src={staticMapUrl}
            alt={`Map showing ${listing.name}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      <div style={{ padding: '1.25rem' }}>
        {/* Header: name + vertical badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <h3 style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontSize: '1.1rem',
            fontWeight: 500,
            color: 'var(--color-ink, #2D2A26)',
            margin: 0,
            lineHeight: 1.3,
          }}>
            {listing.name}
          </h3>
          <span style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: 100,
            background: 'var(--color-cream, #FAF8F5)',
            color: 'var(--color-sage, #5f8a7e)',
            border: '1px solid var(--color-border, #e5e5e5)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {VERTICAL_LABELS[listing.vertical] || listing.vertical}
          </span>
        </div>

        {/* Region */}
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 13,
          color: 'var(--color-muted, #888)',
          margin: '0 0 16px',
        }}>
          {[listing.region, listing.state].filter(Boolean).join(', ')}
        </p>

        {/* Completeness score */}
        {score && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--color-muted, #888)',
              }}>
                Completeness
              </span>
              <span style={{
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: 13,
                fontWeight: 600,
                color: score.score >= 70 ? 'var(--color-sage, #5f8a7e)' : score.score >= 40 ? '#d4a03c' : '#c0392b',
              }}>
                {score.score}%
              </span>
            </div>
            <ScoreBar score={score.score} />

            {/* What's missing */}
            {score.score < 70 && score.improvement_note && (
              <p style={{
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: 12,
                color: 'var(--color-muted, #888)',
                margin: '8px 0 0',
                lineHeight: 1.4,
                fontStyle: 'italic',
              }}>
                {score.improvement_note}
              </p>
            )}

            {score.score < 70 && score.missing_fields && score.missing_fields.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {score.missing_fields.map(f => (
                  <span key={f} style={{
                    fontFamily: 'var(--font-body, system-ui)',
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 100,
                    background: '#fef3cd',
                    color: '#856404',
                  }}>
                    {f.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          padding: '12px 0',
          borderTop: '1px solid var(--color-border, #e5e5e5)',
          borderBottom: '1px solid var(--color-border, #e5e5e5)',
          marginBottom: 16,
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--color-ink, #2D2A26)',
              margin: 0,
            }}>
              {stats.views !== null ? stats.views : '--'}
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted, #888)',
              margin: '2px 0 0',
            }}>
              {stats.views !== null ? 'Views' : 'Views (soon)'}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--color-ink, #2D2A26)',
              margin: 0,
            }}>
              {stats.search_appearances}
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted, #888)',
              margin: '2px 0 0',
            }}>
              Searches
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--color-ink, #2D2A26)',
              margin: 0,
            }}>
              {stats.trail_inclusions}
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted, #888)',
              margin: '2px 0 0',
            }}>
              Trails
            </p>
          </div>
        </div>

        {/* Quick links */}
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={getVendorDashboardUrl(listing.vertical)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              display: 'block',
              textAlign: 'center',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--color-ink, #2D2A26)',
              color: '#fff',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Edit listing
          </a>
          <a
            href={getPublicUrl(listing.vertical, listing.slug)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              display: 'block',
              textAlign: 'center',
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fff',
              color: 'var(--color-ink, #2D2A26)',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
              border: '1px solid var(--color-border, #e5e5e5)',
            }}
          >
            View on site
          </a>
        </div>

        {/* Upgrade CTA for free/basic tier */}
        {!listing.is_featured && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #FAF8F5 0%, #f0ebe4 100%)',
            border: '1px solid var(--color-border, #e5e5e5)',
          }}>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-ink, #2D2A26)',
              margin: '0 0 2px',
            }}>
              Upgrade to Featured
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 11,
              color: 'var(--color-muted, #888)',
              margin: 0,
              lineHeight: 1.4,
            }}>
              Get priority placement in search results, trails, and region pages.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [user, setUser] = useState(null)
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('atlas_auth_token')
    if (!token) {
      setLoading(false)
      return
    }

    const payload = decodeJWT(token)
    if (!payload) {
      setLoading(false)
      return
    }

    setUser({
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      verticals: payload.verticals || {},
    })

    // Fetch dashboard data
    fetch('/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setListings(data.listings || [])
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load dashboard')
        setLoading(false)
      })
  }, [])

  // Not authenticated
  if (!loading && !user) {
    return (
      <div style={{ background: 'var(--color-bg, #FDFCFA)', minHeight: '100vh' }}>
        <section style={{ padding: '6rem 1.5rem 2rem', maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--color-sage, #5f8a7e)', marginBottom: 12,
          }}>
            Operator Dashboard
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: '2rem',
            color: 'var(--color-ink, #2D2A26)', lineHeight: 1.15, marginBottom: '1rem',
          }}>
            Manage your listing
          </h1>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontWeight: 300, fontSize: 15,
            color: 'var(--color-muted, #888)', lineHeight: 1.5, marginBottom: '2rem',
          }}>
            Sign in to view your claimed listings, track search performance, and keep your profile up to date.
          </p>
          <Link
            href="/auth"
            style={{
              display: 'inline-block', padding: '14px 32px', borderRadius: 8,
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              fontFamily: 'var(--font-body, system-ui)', fontWeight: 500, fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Sign in
          </Link>
        </section>
      </div>
    )
  }

  // Authenticated but not vendor role
  if (!loading && user && user.role !== 'vendor' && user.role !== 'admin') {
    return (
      <div style={{ background: 'var(--color-bg, #FDFCFA)', minHeight: '100vh' }}>
        <section style={{ padding: '6rem 1.5rem 2rem', maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--color-sage, #5f8a7e)', marginBottom: 12,
          }}>
            Operator Dashboard
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: '2rem',
            color: 'var(--color-ink, #2D2A26)', lineHeight: 1.15, marginBottom: '1rem',
          }}>
            Claim your listing
          </h1>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontWeight: 300, fontSize: 15,
            color: 'var(--color-muted, #888)', lineHeight: 1.5, marginBottom: '1.5rem',
          }}>
            If you operate a venue listed on the Atlas Network, claim it to update your details, track performance, and connect with visitors.
          </p>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
            color: 'var(--color-muted, #888)', marginBottom: '2rem',
          }}>
            Signed in as {user.name || user.email}
          </p>
          <Link
            href="/explore"
            style={{
              display: 'inline-block', padding: '14px 32px', borderRadius: 8,
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              fontFamily: 'var(--font-body, system-ui)', fontWeight: 500, fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Find your listing
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--color-bg, #FDFCFA)', minHeight: '100vh' }}>
      {/* Header */}
      <section style={{ padding: '5rem 1.5rem 1.5rem', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--color-sage, #5f8a7e)', margin: '0 0 6px',
            }}>
              Operator Dashboard
            </p>
            <h1 style={{
              fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: '1.75rem',
              color: 'var(--color-ink, #2D2A26)', margin: 0, lineHeight: 1.2,
            }}>
              Your Listings
            </h1>
          </div>
          {!loading && (
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 13,
              color: 'var(--color-muted, #888)',
            }}>
              {listings.length} {listings.length === 1 ? 'listing' : 'listings'}
            </span>
          )}
        </div>

        {user && (
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
            color: 'var(--color-muted, #888)', margin: '8px 0 0',
          }}>
            {user.name || user.email}
          </p>
        )}
      </section>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 14, color: 'var(--color-muted, #888)' }}>
            Loading your listings...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <section style={{ padding: '0 1.5rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            padding: '16px 20px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
          }}>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
              color: '#991b1b', margin: 0,
            }}>
              {error}
            </p>
          </div>
        </section>
      )}

      {/* Listings */}
      {!loading && !error && listings.length > 0 && (
        <section style={{ padding: '0 1.5rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {listings.map(listing => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state for vendors with no listings */}
      {!loading && !error && listings.length === 0 && user && (user.role === 'vendor' || user.role === 'admin') && (
        <section style={{ textAlign: 'center', padding: '2rem 1.5rem 4rem', maxWidth: 520, margin: '0 auto' }}>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 15,
            color: 'var(--color-muted, #888)', marginBottom: 8, lineHeight: 1.5,
          }}>
            No claimed listings found yet.
          </p>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
            color: 'var(--color-muted, #888)', marginBottom: 24, lineHeight: 1.5,
          }}>
            Your listings will appear here once a claim is approved. If you have recently claimed a listing, it may still be under review.
          </p>
          <Link
            href="/explore"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 8,
              background: 'var(--color-ink, #2D2A26)', color: '#fff',
              fontFamily: 'var(--font-body, system-ui)', fontWeight: 500, fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Find your listing
          </Link>
        </section>
      )}

      {/* Footer note */}
      <section style={{ padding: '2rem 1.5rem 5rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontWeight: 300, fontSize: 12,
          color: 'var(--color-muted, #888)', opacity: 0.6,
        }}>
          Dashboard data refreshes daily. Search and trail stats reflect the last 30 days.
        </p>
      </section>
    </div>
  )
}
