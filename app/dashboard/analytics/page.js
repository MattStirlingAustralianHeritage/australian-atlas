'use client'

import { useState, useEffect } from 'react'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

function StatCard({ label, value, subtitle }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.5rem',
      flex: '1 1 0',
      minWidth: '180px',
    }}>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.8rem',
        color: 'var(--color-muted)',
        margin: '0 0 0.5rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '2rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: '0 0 0.25rem',
      }}>
        {value}
      </p>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.75rem',
        color: 'var(--color-muted)',
        margin: 0,
      }}>
        {subtitle}
      </p>
    </div>
  )
}

function ListingRow({ listing, stats }) {
  const verticalLabel = VERTICAL_LABELS[listing.vertical] || listing.vertical
  return (
    <tr>
      <td style={{
        padding: '0.75rem 1rem',
        fontFamily: 'var(--font-serif)',
        fontSize: '0.9rem',
        fontWeight: 500,
        color: 'var(--color-ink)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        {listing.name}
        <span style={{
          display: 'block',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.7rem',
          color: 'var(--color-muted)',
          fontWeight: 400,
          marginTop: '2px',
        }}>
          {verticalLabel}
        </span>
      </td>
      {[stats.views_30d, stats.search_count, stats.trail_count, stats.save_count].map((val, i) => (
        <td key={i} style={{
          padding: '0.75rem 1rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.9rem',
          color: 'var(--color-ink)',
          textAlign: 'right',
          borderBottom: '1px solid var(--color-border)',
        }}>
          {val}
        </td>
      ))}
    </tr>
  )
}

export default function DashboardAnalytics() {
  const [listings, setListings] = useState([])
  const [statsMap, setStatsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('atlas_auth_token')
    if (!token) {
      setLoading(false)
      setError('Sign in to view analytics')
      return
    }

    fetch('/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
          setLoading(false)
          return
        }
        const fetched = data.listings || []
        setListings(fetched)

        if (fetched.length === 0) {
          setLoading(false)
          return
        }

        let completed = 0
        for (const listing of fetched) {
          fetch(`/api/dashboard/stats?listing_id=${listing.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(r => r.ok ? r.json() : null)
            .then(stats => {
              if (stats && !stats.error) {
                setStatsMap(prev => ({ ...prev, [listing.id]: stats }))
              }
              completed++
              if (completed >= fetched.length) setLoading(false)
            })
            .catch(() => {
              completed++
              if (completed >= fetched.length) setLoading(false)
            })
        }
      })
      .catch(() => {
        setError('Failed to load analytics')
        setLoading(false)
      })
  }, [])

  const totals = Object.values(statsMap).reduce(
    (acc, s) => ({
      views_30d: acc.views_30d + (s.views_30d || 0),
      views_total: acc.views_total + (s.views_total || 0),
      search_count: acc.search_count + (s.search_count || 0),
      trail_count: acc.trail_count + (s.trail_count || 0),
      save_count: acc.save_count + (s.save_count || 0),
    }),
    { views_30d: 0, views_total: 0, search_count: 0, trail_count: 0, save_count: 0 }
  )

  const hasStats = Object.keys(statsMap).length > 0

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.75rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: '0 0 0.25rem',
        }}>
          Listing Insights
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          Performance across all your claimed listings
        </p>
      </div>

      {error && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          textAlign: 'center',
          marginBottom: '1rem',
        }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--color-muted)', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* Aggregate stat cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <StatCard
          label="Views"
          value={loading ? '...' : totals.views_30d}
          subtitle="Last 30 days"
        />
        <StatCard
          label="Search Appearances"
          value={loading ? '...' : totals.search_count}
          subtitle="Last 30 days"
        />
        <StatCard
          label="Trail Inclusions"
          value={loading ? '...' : totals.trail_count}
          subtitle="Total"
        />
        <StatCard
          label="Saves"
          value={loading ? '...' : totals.save_count}
          subtitle="Total"
        />
      </div>

      {/* All-time views */}
      {hasStats && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '1.25rem 1.5rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <span style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.8rem',
            color: 'var(--color-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            All-time views
          </span>
          <span style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.5rem',
            fontWeight: 600,
            color: 'var(--color-ink)',
          }}>
            {totals.views_total}
          </span>
        </div>
      )}

      {/* Per-listing breakdown */}
      {hasStats && listings.length > 1 && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '1.25rem 1.5rem 0.75rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'var(--color-ink)',
              margin: 0,
            }}>
              Per-listing breakdown
            </h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Listing', 'Views (30d)', 'Searches (30d)', 'Trails', 'Saves'].map((h, i) => (
                    <th key={h} style={{
                      padding: '0.5rem 1rem',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: 'var(--color-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      textAlign: i === 0 ? 'left' : 'right',
                      borderBottom: '1px solid var(--color-border)',
                      background: '#fafaf8',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listings.map(listing => {
                  const s = statsMap[listing.id]
                  if (!s) return null
                  return <ListingRow key={listing.id} listing={listing} stats={s} />
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && listings.length === 0 && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.9rem',
            color: 'var(--color-muted)',
            margin: 0,
          }}>
            No claimed listings yet. Claim a venue on any Atlas vertical to see analytics here.
          </p>
        </div>
      )}
    </div>
  )
}
