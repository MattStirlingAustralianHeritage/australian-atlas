'use client'

import { useEffect, useState } from 'react'
import { getDashboardToken } from '@/lib/dashboard-token'

// ─────────────────────────────────────────────────────────────────────────────
// Peer benchmarks — how the operator's listing compares with similar venues.
//
// Renders inside /dashboard/analytics. Fetches /api/dashboard/benchmarks per
// owned listing (the API is owner + paid gated; it calls the aggregate-only
// listing_peer_benchmarks RPC). Cohort = active listings sharing the same
// vertical AND state. Everything shown is anonymous — medians, top-quarter
// values and your percentile; never another venue's name or numbers.
//
// Reporting only: benchmarks are private to the operator and NOTHING here
// (or anywhere on the Atlas) influences search, map or discover ranking, or
// any visitor-facing ordering.
// ─────────────────────────────────────────────────────────────────────────────

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const METRIC_ROWS = [
  { key: 'search_appearances', label: 'Search appearances', window: 'Last 30 days' },
  { key: 'saves', label: 'Atlas Passport saves', window: 'All-time' },
  { key: 'trail_inclusions', label: 'Trail inclusions', window: 'All-time' },
]

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'
  return `${n}${suffix}`
}

// Strip a trailing .0 from RPC numerics (3.0 → 3, 3.5 stays 3.5).
function fmt(n) {
  return Number.isFinite(n) ? String(Number(n)) : '—'
}

// One metric: label + your count vs cohort median / top quarter, and a simple
// CSS percentile bar (fill = share of the cohort at or below your count, with
// a faint tick at the halfway mark).
function MetricRow({ label, windowLabel, metric }) {
  const pct = Math.max(0, Math.min(100, Math.round(metric?.percentile ?? 0)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ flex: '0 0 210px', minWidth: 0 }}>
        <span style={{
          display: 'block',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.85rem',
          color: 'var(--color-ink)',
        }}>
          {label}
        </span>
        <span style={{
          display: 'block',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.7rem',
          color: 'var(--color-muted)',
          marginTop: 2,
        }}>
          {windowLabel} · you {fmt(metric?.you)} · median {fmt(metric?.median)} · top quarter {fmt(metric?.p75)}
        </span>
      </div>
      <div
        style={{ flex: '1 1 160px', position: 'relative', height: 8, borderRadius: 4, background: 'var(--color-cream, #FAF8F5)', overflow: 'hidden' }}
        title={`Your count is at or above ${pct}% of similar listings`}
      >
        <div style={{
          width: `${Math.max(pct, 2)}%`,
          height: '100%',
          borderRadius: 4,
          background: 'var(--color-sage, #5f8a7e)',
        }} />
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 1,
          background: 'var(--color-border, #e5e5e5)',
        }} />
      </div>
      <span style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.8rem',
        color: 'var(--color-muted)',
        flex: '0 0 5.5rem',
        textAlign: 'right',
      }}>
        {ordinal(pct)} pctile
      </span>
    </div>
  )
}

// Honest empty state — a median over a handful of venues is noise, and tiny
// cohorts edge toward identifying individual businesses.
function CohortTooSmall({ cohortLabel, cohortSize }) {
  return (
    <p style={{
      fontFamily: 'var(--font-sans)',
      fontSize: '0.9rem',
      lineHeight: 1.6,
      color: 'var(--color-muted)',
      margin: 0,
    }}>
      Not enough peers to compare fairly yet. Benchmarks need at least 8 active {cohortLabel} —
      there {cohortSize === 1 ? 'is' : 'are'} {cohortSize} today. We&rsquo;d rather show nothing
      than a misleading comparison; this will unlock as the cohort grows.
    </p>
  )
}

// Locked state for non-paid owners — same treatment as the AI Visibility section.
function LockedState() {
  return (
    <div style={{
      background: 'var(--color-cream)',
      border: '1px solid var(--color-border)',
      borderLeft: '3px solid var(--color-gold)',
      borderRadius: 12,
      padding: '1.75rem 2rem',
      marginBottom: '2rem',
    }}>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-gold)', margin: '0 0 0.6rem' }}>
        A Standard-plan feature
      </p>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
        See how you compare with similar venues
      </h2>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
        Peer benchmarks show where your search appearances, saves and trail inclusions sit against
        venues of your type in your state — anonymised medians and percentiles, never names.
        Benchmarks are private to you. Ranking is never affected.
      </p>
      <a href="/dashboard/subscription" style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-ink)', color: 'var(--color-cream)', padding: '0.65rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
        Manage subscription
      </a>
    </div>
  )
}

// Human cohort descriptor: "Small Batch listings in VIC" (state can be null).
function cohortLabel(report) {
  const vertical = VERTICAL_LABELS[report.vertical] || report.vertical
  return report.state ? `${vertical} listings in ${report.state}` : `${vertical} listings`
}

export default function BenchmarksSection({ listings }) {
  const [state, setState] = useState('loading') // 'loading' | 'ready' | 'locked' | 'hidden'
  const [reports, setReports] = useState([])

  const idsKey = (listings || []).map(l => l.id).join(',')

  useEffect(() => {
    let alive = true
    if (!idsKey) { setState('hidden'); return undefined }
    setState('loading')
    getDashboardToken().then(async (token) => {
      if (!alive) return
      if (!token) { setState('hidden'); return }
      const results = await Promise.all((listings || []).map(l =>
        fetch(`/api/dashboard/benchmarks?listingId=${encodeURIComponent(l.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => (r.ok ? r.json() : null))
          .then(d => (d && !d.error ? d : null))
          .catch(() => null)
      ))
      if (!alive) return
      const paidReports = results.filter(r => r && r.paid)
      const lockedCount = results.filter(r => r && r.locked).length
      if (paidReports.length > 0) {
        setReports(paidReports)
        setState('ready')
      } else if (lockedCount > 0) {
        setState('locked')
      } else {
        // Every fetch failed — stay quiet rather than show invented numbers.
        setState('hidden')
      }
    })
    return () => { alive = false }
  }, [idsKey])

  if (state === 'hidden' || state === 'loading') return null
  if (state === 'locked') return <LockedState />

  const single = reports.length === 1

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem 1.5rem 1.5rem',
      // Collapses with the previous card's bottom margin — the per-listing
      // breakdown table (this card's neighbour for multi-listing operators)
      // carries no bottom margin of its own.
      marginTop: '2rem',
      marginBottom: '2rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.1rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: 0,
        }}>
          How you compare
          {single && (
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.8rem',
              fontWeight: 400,
              color: 'var(--color-muted)',
              marginLeft: '0.5rem',
            }}>
              (anonymous, {cohortLabel(reports[0])})
            </span>
          )}
        </h2>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
          Anonymous peer comparison
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {reports.map(report => (
          <div key={report.listing?.id || cohortLabel(report)}>
            {!single && (
              <p style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--color-ink)',
                margin: '0 0 0.2rem',
              }}>
                {report.listing?.name}
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.75rem',
                  fontWeight: 400,
                  color: 'var(--color-muted)',
                  marginLeft: '0.5rem',
                }}>
                  anonymous, {cohortLabel(report)}
                </span>
              </p>
            )}
            {report.cohort_too_small ? (
              <CohortTooSmall cohortLabel={cohortLabel(report)} cohortSize={report.cohort_size || 0} />
            ) : (
              <>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.75rem',
                  color: 'var(--color-muted)',
                  margin: '0 0 0.75rem',
                }}>
                  Compared with {report.cohort_size} active {cohortLabel(report)} · the bar shows the
                  share of that cohort at or below your count (tick = halfway)
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {METRIC_ROWS.map(({ key, label, window: windowLabel }) => (
                    <MetricRow
                      key={key}
                      label={label}
                      windowLabel={windowLabel}
                      metric={report.metrics?.[key]}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Privacy + integrity plank */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', marginTop: '1.25rem' }}>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.78rem',
          lineHeight: 1.6,
          color: 'var(--color-muted)',
          margin: 0,
          fontStyle: 'italic',
        }}>
          <strong style={{ color: 'var(--color-ink)', fontWeight: 600, fontStyle: 'normal' }}>
            Benchmarks are private to you. Ranking is never affected.
          </strong>{' '}
          You see anonymous cohort aggregates only — no other venue is ever identified, and no
          other operator can see your numbers.
        </p>
      </div>
    </div>
  )
}
