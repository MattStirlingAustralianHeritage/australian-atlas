'use client'

import { useState, useEffect, useCallback } from 'react'
const VERTICALS = [
  { key: 'sba', label: 'Small Batch', color: '#C49A3C' },
  { key: 'collection', label: 'Collection', color: '#7A6B8A' },
  { key: 'craft', label: 'Craft', color: '#C1603A' },
  { key: 'fine_grounds', label: 'Fine Grounds', color: '#8A7055' },
  { key: 'rest', label: 'Rest', color: '#5A8A9A' },
  { key: 'field', label: 'Field', color: '#4A7C59' },
  { key: 'corner', label: 'Corner', color: '#5F8A7E' },
  { key: 'found', label: 'Found', color: '#D4956A' },
  { key: 'table', label: 'Table', color: '#C4634F' },
]

const SCORE_FILTERS = [
  { key: 'all', label: 'Below 70', maxScore: 70 },
  { key: 'critical', label: 'Critical (<40)', maxScore: 40 },
  { key: 'incomplete', label: 'Incomplete (<70)', maxScore: 70 },
]

export default function CompletenessPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [vertical, setVertical] = useState(null)
  const [scoreFilter, setScoreFilter] = useState('all')

  // Read URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('vertical')) setVertical(params.get('vertical'))
    if (params.get('max_score')) {
      const ms = parseInt(params.get('max_score'), 10)
      if (ms <= 40) setScoreFilter('critical')
      else setScoreFilter('all')
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (vertical) params.set('vertical', vertical)
      const filter = SCORE_FILTERS.find(f => f.key === scoreFilter)
      if (filter) params.set('max_score', filter.maxScore)

      const res = await fetch(`/api/admin/completeness?${params}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch (err) {
      console.error('Failed to fetch completeness data:', err)
    }
    setLoading(false)
  }, [vertical, scoreFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams()
    if (vertical) params.set('vertical', vertical)
    const filter = SCORE_FILTERS.find(f => f.key === scoreFilter)
    if (filter && filter.key !== 'all') params.set('max_score', filter.maxScore)
    const qs = params.toString()
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', newUrl)
  }, [vertical, scoreFilter])

  const summary = data?.summary
  const listings = data?.listings || []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream, #F5F1EB)', fontFamily: 'var(--font-sans, system-ui)' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif, Georgia)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: '0' }}>
            Listing Completeness
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={vertical || ''}
            onChange={e => setVertical(e.target.value || null)}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid var(--color-border, #E5E0D8)',
              background: '#fff',
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'var(--color-ink, #2D2A26)',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <option value="">All verticals</option>
            {VERTICALS.map(v => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
          {SCORE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setScoreFilter(f.key)}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #E5E0D8)',
                background: scoreFilter === f.key ? 'var(--color-ink, #2D2A26)' : 'transparent',
                color: scoreFilter === f.key ? '#fff' : 'var(--color-muted, #8B8578)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-muted)' }}>
          Loading completeness data...
        </div>
      ) : (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <SummaryCard
              label="Critical"
              sublabel="Score < 40"
              value={summary?.critical ?? 0}
              color="#c53030"
              bgColor="#fef2f2"
            />
            <SummaryCard
              label="Incomplete"
              sublabel="Score 40-69"
              value={summary?.incomplete ?? 0}
              color="#b7791f"
              bgColor="#fefcbf"
            />
            <SummaryCard
              label="Good"
              sublabel="Score 70+"
              value={summary?.good ?? 0}
              color="#276749"
              bgColor="#f0fff4"
            />
            <SummaryCard
              label="Average Score"
              sublabel={`${summary?.total ?? 0} total listings`}
              value={`${summary?.averageScore ?? 0}/100`}
              color="var(--color-ink, #2D2A26)"
              bgColor="#fff"
            />
          </div>

          {/* Per-Vertical Breakdown */}
          {!vertical && summary?.byVertical && Object.keys(summary.byVertical).length > 0 && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', padding: '1.25rem', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--color-ink)' }}>
                By Vertical
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                {VERTICALS.map(v => {
                  const stats = summary.byVertical[v.key]
                  if (!stats || stats.total === 0) return null
                  const goodPct = Math.round((stats.good / stats.total) * 100)
                  return (
                    <button
                      key={v.key}
                      onClick={() => setVertical(vertical === v.key ? null : v.key)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        border: vertical === v.key
                          ? `2px solid ${v.color}`
                          : '1px solid var(--color-border, #E5E0D8)',
                        background: vertical === v.key ? '#FAFAFA' : 'transparent',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: v.color }}>
                          {v.label}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          avg {stats.avg}/100
                        </span>
                      </div>
                      {/* Stacked bar */}
                      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--color-border, #E5E0D8)' }}>
                        {stats.critical > 0 && (
                          <div style={{ width: `${(stats.critical / stats.total) * 100}%`, background: '#c53030' }} />
                        )}
                        {stats.incomplete > 0 && (
                          <div style={{ width: `${(stats.incomplete / stats.total) * 100}%`, background: '#d69e2e' }} />
                        )}
                        {stats.good > 0 && (
                          <div style={{ width: `${(stats.good / stats.total) * 100}%`, background: '#38a169' }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.375rem', fontSize: '0.7rem', color: 'var(--color-muted)' }}>
                        <span>{stats.critical} critical</span>
                        <span>{stats.incomplete} incomplete</span>
                        <span>{stats.good} good</span>
                        <span style={{ marginLeft: 'auto' }}>{goodPct}% complete</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Listings Table */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--color-ink)' }}>
                Listings Needing Improvement
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                {listings.length} listing{listings.length !== 1 ? 's' : ''}
              </span>
            </div>

            {listings.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.9rem' }}>
                {loading ? 'Loading...' : 'No listings below the selected threshold.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                {/* Table header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2.5fr 0.8fr 0.6fr 2fr 2fr',
                  gap: '0.5rem 1rem',
                  padding: '0.75rem 1.25rem',
                  borderBottom: '1px solid var(--color-border, #E5E0D8)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--color-muted, #8B8578)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  minWidth: '800px',
                }}>
                  <div>Name</div>
                  <div>Vertical</div>
                  <div style={{ textAlign: 'center' }}>Score</div>
                  <div>Missing Fields</div>
                  <div>Top Improvement</div>
                </div>

                {/* Table rows */}
                {listings.map((listing, i) => {
                  const vConfig = VERTICALS.find(v => v.key === listing.vertical) || { label: listing.vertical, color: '#888' }
                  const tierColor = listing.score < 40 ? '#c53030' : listing.score < 70 ? '#b7791f' : '#276749'
                  const tierBg = listing.score < 40 ? '#fef2f2' : listing.score < 70 ? '#fffff0' : '#f0fff4'

                  return (
                    <div
                      key={listing.listing_id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2.5fr 0.8fr 0.6fr 2fr 2fr',
                        gap: '0.5rem 1rem',
                        padding: '0.75rem 1.25rem',
                        borderBottom: i < listings.length - 1 ? '1px solid var(--color-border, #E5E0D8)' : 'none',
                        fontSize: '0.8rem',
                        alignItems: 'center',
                        minWidth: '800px',
                      }}
                    >
                      {/* Name */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {listing.name}
                        </div>
                        {(listing.state || listing.region) && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginTop: '0.125rem' }}>
                            {[listing.region, listing.state].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>

                      {/* Vertical */}
                      <div>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '999px',
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          color: '#fff',
                          background: vConfig.color,
                          whiteSpace: 'nowrap',
                        }}>
                          {vConfig.label}
                        </span>
                      </div>

                      {/* Score */}
                      <div style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: tierColor,
                          background: tierBg,
                        }}>
                          {listing.score}
                        </span>
                      </div>

                      {/* Missing Fields */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {(listing.missing_fields || []).slice(0, 5).map((field, j) => (
                          <span
                            key={j}
                            style={{
                              display: 'inline-block',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              background: '#f7f7f7',
                              color: '#666',
                              border: '1px solid #eee',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {field}
                          </span>
                        ))}
                        {(listing.missing_fields || []).length > 5 && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)' }}>
                            +{listing.missing_fields.length - 5} more
                          </span>
                        )}
                      </div>

                      {/* Improvement Note */}
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', lineHeight: 1.4 }}>
                        {listing.improvement_note || '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, sublabel, value, color, bgColor }) {
  return (
    <div style={{
      background: bgColor || '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border, #E5E0D8)',
      padding: '1.25rem',
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted, #8B8578)', margin: '0 0 0.125rem' }}>
        {label}
      </p>
      {sublabel && (
        <p style={{ fontSize: '0.65rem', color: 'var(--color-muted, #8B8578)', margin: '0 0 0.375rem' }}>
          {sublabel}
        </p>
      )}
      <p style={{ fontSize: '2rem', fontWeight: 600, color, margin: 0, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-serif, Georgia)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}
