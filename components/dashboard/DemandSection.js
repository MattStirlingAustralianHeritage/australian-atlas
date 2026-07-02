'use client'

import { useEffect, useState } from 'react'
import { getDashboardToken } from '@/lib/dashboard-token'

// ─────────────────────────────────────────────────────────────────────────────
// Search demand — what travellers actually searched on the Atlas.
//
// Renders inside /dashboard/analytics. Fetches /api/dashboard/demand per owned
// listing (the API is owner + paid gated). Three honest blocks per the new
// search_result_impressions telemetry (migration 205 — logging began THIS
// WEEK, so early data is sparse and the empty states say so plainly):
//
//   1. Queries you appeared for — real searches where this listing was in the
//      results, with appearance count and best position.
//   2. Unmet searches on the Atlas — NETWORK-WIDE zero-result queries (clearly
//      labelled as such; rendered once, not per listing).
//   3. Keyword hints — current search keywords plus suggested words drawn from
//      the queries in block 1.
//
// Reporting only: everything here is private to the operator, and NOTHING here
// (keywords included) influences search, map or discover ranking, or any
// visitor-facing ordering — keywords help a listing MATCH relevant searches,
// never outrank anyone.
// ─────────────────────────────────────────────────────────────────────────────

// The mandated honest empty state — impression logging is days old.
const COLLECTING_COPY = 'Impression tracking began this week — your first search data appears within days.'

function SubHeading({ children, tag }) {
  return (
    <p style={{
      fontFamily: 'var(--font-sans)',
      fontSize: '0.7rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--color-muted)',
      margin: '0 0 0.6rem',
    }}>
      {children}
      {tag && (
        <span style={{
          fontWeight: 500,
          textTransform: 'none',
          letterSpacing: 0,
          marginLeft: '0.5rem',
          padding: '0.1rem 0.45rem',
          borderRadius: 999,
          border: '1px solid var(--color-border)',
          background: 'var(--color-cream, #FAF8F5)',
          fontSize: '0.68rem',
        }}>
          {tag}
        </span>
      )}
    </p>
  )
}

function MutedLine({ children }) {
  return (
    <p style={{
      fontFamily: 'var(--font-sans)',
      fontSize: '0.85rem',
      lineHeight: 1.6,
      color: 'var(--color-muted)',
      margin: 0,
    }}>
      {children}
    </p>
  )
}

// Block 1: queries this listing appeared for, as a compact table.
function AppearedBlock({ appeared }) {
  const queries = appeared?.queries || []
  if (queries.length === 0) {
    return (
      <div>
        <SubHeading>Queries you appeared for</SubHeading>
        <MutedLine>{COLLECTING_COPY}</MutedLine>
      </div>
    )
  }
  return (
    <div>
      <SubHeading>Queries you appeared for</SubHeading>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Search', 'Appearances', 'Best position'].map((h, i) => (
                <th key={h} style={{
                  padding: '0.35rem 0.75rem 0.35rem 0',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--color-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  textAlign: i === 0 ? 'left' : 'right',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queries.map(q => (
              <tr key={q.query}>
                <td style={{
                  padding: '0.45rem 0.75rem 0.45rem 0',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  color: 'var(--color-ink)',
                  borderBottom: '1px solid var(--color-border)',
                  maxWidth: 420,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  &ldquo;{q.query}&rdquo;
                </td>
                <td style={{
                  padding: '0.45rem 0 0.45rem 0.75rem',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  color: 'var(--color-ink)',
                  textAlign: 'right',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  {q.count}
                </td>
                <td style={{
                  padding: '0.45rem 0 0.45rem 0.75rem',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  color: 'var(--color-ink)',
                  textAlign: 'right',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  {q.best_position ? `#${q.best_position}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.72rem',
        color: 'var(--color-muted)',
        margin: '0.5rem 0 0',
      }}>
        Real Atlas searches (last 30 days) where this listing was in the results shown.
        Tracking began this week, so counts start small and build daily.
        {appeared.capped ? ' Counts reflect your most recent 5,000 appearances.' : ''}
      </p>
    </div>
  )
}

// Block 3: current keywords + honest suggestions drawn from block 1's queries.
function KeywordsBlock({ keywords, listingId, hasAppearanceData }) {
  const current = keywords?.current || []
  const suggestions = keywords?.suggestions || []

  const chip = (base) => ({
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: 999,
    fontFamily: 'var(--font-sans)',
    fontSize: '0.78rem',
    ...base,
  })

  return (
    <div>
      <SubHeading>Keyword hints</SubHeading>

      {current.length > 0 ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0 0 0.4rem' }}>
            Your current search keywords
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {current.map(k => (
              <span key={k} style={chip({
                background: 'var(--color-cream, #FAF8F5)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-ink)',
              })}>
                {k}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--color-muted)', margin: '0 0 0.75rem' }}>
          You haven&rsquo;t added any search keywords yet.
        </p>
      )}

      {suggestions.length > 0 ? (
        <div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0 0 0.4rem' }}>
            Words travellers used in searches where you appeared, that aren&rsquo;t in your
            name, description or keywords yet — consider adding them as search keywords.
            They help you match relevant searches; they never boost ranking.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {suggestions.map(s => (
              <span
                key={s.word}
                title={`Appeared in ${s.count} ${s.count === 1 ? 'search' : 'searches'} you were shown for`}
                style={chip({
                  background: '#fff',
                  border: '1px dashed var(--color-sage, #5f8a7e)',
                  color: 'var(--color-sage, #5f8a7e)',
                })}
              >
                + {s.word}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <MutedLine>
          {hasAppearanceData
            ? 'No new hints — the words travellers use are already covered by your listing.'
            : 'Suggestions build from real searches, so they appear alongside your first search data.'}
        </MutedLine>
      )}

      <a
        href={`/dashboard/listings/${listingId}/edit`}
        style={{
          display: 'inline-block',
          marginTop: '0.75rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        Manage search keywords →
      </a>
    </div>
  )
}

// Block 2: network-wide zero-result searches. Rendered ONCE (it's the same
// list for every listing) and clearly labelled network-wide.
function UnmetBlock({ unmet }) {
  return (
    <div>
      <SubHeading tag="network-wide">Unmet searches on the Atlas</SubHeading>
      {(unmet || []).length === 0 ? (
        <MutedLine>No zero-result searches recorded across the Atlas in the last 30 days.</MutedLine>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
            Recent searches across the whole Atlas network that returned no results — not
            specific to your venue. If one describes what you genuinely offer, travellers
            may be searching in words your listing doesn&rsquo;t use yet.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {unmet.map(u => (
              <span
                key={u.query}
                title={`Searched ${u.count} ${u.count === 1 ? 'time' : 'times'} in the last 30 days, no results`}
                style={{
                  display: 'inline-block',
                  padding: '0.2rem 0.6rem',
                  borderRadius: 999,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-cream, #FAF8F5)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.78rem',
                  color: 'var(--color-ink)',
                  maxWidth: 320,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'top',
                }}
              >
                &ldquo;{u.query}&rdquo;{u.count > 1 ? ` ×${u.count}` : ''}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Locked state for non-paid owners — same treatment as the Benchmarks section.
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
        See what travellers searched
      </h2>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
        Search demand shows the real queries your listing appeared for, searches across the
        Atlas that found nothing, and honest keyword hints drawn from both. Private to you.
        Ranking is never affected.
      </p>
      <a href="/dashboard/subscription" style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-ink)', color: 'var(--color-cream)', padding: '0.65rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
        Manage subscription
      </a>
    </div>
  )
}

export default function DemandSection({ listings }) {
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
        fetch(`/api/dashboard/demand?listingId=${encodeURIComponent(l.id)}`, {
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
  // Unmet searches are network-wide — identical for every listing, so render
  // the list once from the first report.
  const unmet = reports[0]?.unmet || []

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem 1.5rem 1.5rem',
      marginBottom: '2rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.1rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: 0,
        }}>
          What travellers searched
        </h2>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
          Last 30 days · private to you
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {reports.map(report => (
          <div key={report.listing?.id} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {!single && (
              <p style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--color-ink)',
                margin: 0,
              }}>
                {report.listing?.name}
              </p>
            )}
            <AppearedBlock appeared={report.appeared} />
            <KeywordsBlock
              keywords={report.keywords}
              listingId={report.listing?.id}
              hasAppearanceData={(report.appeared?.queries || []).length > 0}
            />
          </div>
        ))}

        <UnmetBlock unmet={unmet} />
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
            Search demand is private to you. Ranking is never affected.
          </strong>{' '}
          Every query shown is a real search from the Atlas telemetry log — nothing is
          modelled or invented. Keywords help you match relevant searches; they never
          boost your position.
        </p>
      </div>
    </div>
  )
}
