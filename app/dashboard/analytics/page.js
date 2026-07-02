'use client'

import { useAuth } from '../layout'
import AiVisibilitySection from '@/components/dashboard/AiVisibilitySection'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

function trendParts(current, previous) {
  if (!previous) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { text: 'level with prior 30 days', color: 'var(--color-muted)' }
  const up = pct > 0
  return {
    text: `${up ? '↑' : '↓'} ${Math.abs(pct)}% vs prior 30 days`,
    color: up ? 'var(--color-sage, #5f8a7e)' : '#A33A2A',
  }
}

function StatCard({ label, value, subtitle, trend, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        padding: '1.5rem',
        flex: '1 1 0',
        minWidth: '180px',
      }}
    >
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
      {trend ? (
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: trend.color,
          margin: 0,
        }}>
          {trend.text}
        </p>
      ) : (
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.75rem',
          color: 'var(--color-muted)',
          margin: 0,
        }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

// 30-day daily views as an SVG bar chart. Pure render — data arrives
// zero-filled and date-keyed from /api/dashboard/stats.
function DailyViewsChart({ series }) {
  if (!series || series.length === 0) return null
  const max = Math.max(...series.map(d => d.views), 1)
  const W = 900
  const H = 160
  const gap = 4
  const barW = (W - gap * (series.length - 1)) / series.length

  const monthDay = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`)
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem 1.5rem 1rem',
      marginBottom: '2rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.1rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: 0,
        }}>
          Daily views
        </h2>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
          Last 30 days · peak {Math.max(...series.map(d => d.views))}/day
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Daily views over the last 30 days">
        {series.map((d, i) => {
          const h = Math.max(d.views > 0 ? 3 : 1, Math.round((d.views / max) * H))
          return (
            <rect
              key={d.date}
              x={i * (barW + gap)}
              y={H - h}
              width={barW}
              height={h}
              rx={2}
              fill={d.views > 0 ? 'var(--color-sage, #5f8a7e)' : 'var(--color-border, #e5e5e5)'}
            >
              <title>{`${monthDay(d.date)}: ${d.views} ${d.views === 1 ? 'view' : 'views'}`}</title>
            </rect>
          )
        })}
        <text x={0} y={H + 14} fontSize="11" fill="var(--color-muted, #888)" fontFamily="var(--font-sans, system-ui)">
          {monthDay(series[0].date)}
        </text>
        <text x={W} y={H + 14} fontSize="11" textAnchor="end" fill="var(--color-muted, #888)" fontFamily="var(--font-sans, system-ui)">
          {monthDay(series[series.length - 1].date)}
        </text>
      </svg>
    </div>
  )
}

function AudiencePanels({ locations, devices }) {
  const deviceTotal = devices.mobile + devices.desktop + devices.other
  const hasLocations = locations.length > 0
  if (!hasLocations && deviceTotal === 0) return null

  const maxLoc = hasLocations ? locations[0].count : 0

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
      {hasLocations && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '1.25rem 1.5rem',
          flex: '2 1 320px',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--color-ink)',
            margin: '0 0 1rem',
          }}>
            Where your visitors are
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {locations.map(loc => (
              <div key={loc.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  color: 'var(--color-ink)',
                  flex: '0 0 40%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {loc.label}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--color-cream, #FAF8F5)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(6, Math.round((loc.count / maxLoc) * 100))}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: 'var(--color-sage, #5f8a7e)',
                  }} />
                </div>
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.8rem',
                  color: 'var(--color-muted)',
                  flex: '0 0 2.5rem',
                  textAlign: 'right',
                }}>
                  {loc.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {deviceTotal > 0 && (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '1.25rem 1.5rem',
          flex: '1 1 200px',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--color-ink)',
            margin: '0 0 1rem',
          }}>
            Devices
          </h2>
          {[
            ['Mobile', devices.mobile],
            ['Desktop', devices.desktop],
            ...(devices.other > 0 ? [['Other', devices.other]] : []),
          ].map(([label, count]) => (
            <div key={label} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-ink)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                  {Math.round((count / deviceTotal) * 100)}%
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--color-cream, #FAF8F5)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round((count / deviceTotal) * 100)}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: 'var(--color-gold, #C4973B)',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
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
      {[stats.views_30d, stats.unique_visitors_30d, stats.search_count, stats.trail_count, stats.save_count].map((val, i) => (
        <td key={i} style={{
          padding: '0.75rem 1rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.9rem',
          color: 'var(--color-ink)',
          textAlign: 'right',
          borderBottom: '1px solid var(--color-border)',
        }}>
          {val ?? 0}
        </td>
      ))}
    </tr>
  )
}

export default function DashboardAnalytics() {
  // Listings + per-listing stats are fetched once by the dashboard layout and
  // shared via context — this page just aggregates and renders.
  const { dashUser, listings, listingsLoading, listingsError, stats: statsMap, statsLoading } = useAuth()
  const loading = listingsLoading || statsLoading
  const error = listingsError || (!listingsLoading && !dashUser ? 'Sign in to view analytics' : null)

  const statsList = listings.map(l => statsMap[l.id]).filter(Boolean)

  const totals = statsList.reduce(
    (acc, s) => ({
      views_30d: acc.views_30d + (s.views_30d || 0),
      views_prev_30d: acc.views_prev_30d + (s.views_prev_30d || 0),
      views_total: acc.views_total + (s.views_total || 0),
      unique_visitors_30d: acc.unique_visitors_30d + (s.unique_visitors_30d || 0),
      search_count: acc.search_count + (s.search_count || 0),
      trail_count: acc.trail_count + (s.trail_count || 0),
      save_count: acc.save_count + (s.save_count || 0),
    }),
    { views_30d: 0, views_prev_30d: 0, views_total: 0, unique_visitors_30d: 0, search_count: 0, trail_count: 0, save_count: 0 }
  )

  // Merge per-listing daily series into one network-wide series (dates align:
  // every listing gets the same zero-filled 30-day window from the API).
  const dailyMap = new Map()
  for (const s of statsList) {
    for (const d of s.daily_views || []) {
      dailyMap.set(d.date, (dailyMap.get(d.date) || 0) + d.views)
    }
  }
  const dailySeries = [...dailyMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, views]) => ({ date, views }))

  // Merge visitor locations across listings.
  const locMap = new Map()
  for (const s of statsList) {
    for (const loc of s.top_locations || []) {
      locMap.set(loc.label, (locMap.get(loc.label) || 0) + loc.count)
    }
  }
  const topLocations = [...locMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }))

  const devices = statsList.reduce(
    (acc, s) => ({
      mobile: acc.mobile + (s.devices?.mobile || 0),
      desktop: acc.desktop + (s.devices?.desktop || 0),
      other: acc.other + (s.devices?.other || 0),
    }),
    { mobile: 0, desktop: 0, other: 0 }
  )

  const hasStats = statsList.length > 0

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
          Real visitors to your public pages across the Atlas network — bots excluded
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
          trend={loading ? null : trendParts(totals.views_30d, totals.views_prev_30d)}
        />
        <StatCard
          label="Unique visitors"
          value={loading ? '...' : totals.unique_visitors_30d}
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
          label="Atlas Passport saves"
          value={loading ? '...' : totals.save_count}
          subtitle="Total"
          tooltip="Saves from users who used Discover or saved from australianatlas.com.au directly. Vertical-level favourites are tracked separately."
        />
      </div>

      {/* Daily views chart */}
      {!loading && hasStats && <DailyViewsChart series={dailySeries} />}

      {/* Audience: locations + devices */}
      {!loading && hasStats && <AudiencePanels locations={topLocations} devices={devices} />}

      {/* AI Visibility — how AI assistants read your pages (self-fetching; handles
          its own loading / locked / hidden states, paid-gated by the API) */}
      {listings.length > 0 && <AiVisibilitySection listings={listings} />}

      {/* All-time views */}
      {hasStats && !loading && (
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
      {hasStats && !loading && listings.length > 1 && (
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
                  {['Listing', 'Views (30d)', 'Visitors (30d)', 'Searches (30d)', 'Trails', 'Atlas Passport saves'].map((h, i) => (
                    <th
                      key={h}
                      title={h === 'Atlas Passport saves' ? 'Saves from users who used Discover or saved from australianatlas.com.au directly. Vertical-level favourites are tracked separately.' : undefined}
                      style={{
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
