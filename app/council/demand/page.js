'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, PageHeader, SectionTitle, StatCard, EmptyState, RangePicker, Skeleton } from '@/components/council/ui'
import { BarRows, DeltaBadge } from '@/components/council/charts'

// Search-demand intelligence: what visitors are looking for in the council's
// region. The "unmet demand" list — searches that found little or nothing — is
// the demand-side signal no spend-data product can see, and reads directly as
// a product-gap list for destination planning.

export default function CouncilDemand() {
  const { council, regions } = useCouncil()
  const [range, setRange] = useState('90d')
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/council/data?view=insights&range=${range}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setInsights(d.insights || null); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range])

  if (!council) return null

  return (
    <div>
      <PageHeader
        title="Search demand"
        subtitle="What people searched for on the Atlas network that names your region or its towns — including searches that found little or nothing. Spend data tells you what visitors bought; this tells you what they wanted."
      >
        <RangePicker value={range} onChange={setRange} />
      </PageHeader>

      {loading ? (
        <>
          <Skeleton height={110} style={{ marginBottom: '1.25rem' }} />
          <Skeleton height={300} />
        </>
      ) : !insights?.byRegion?.length ? (
        <EmptyState title="No search data yet">
          Search interest appears here once Atlas visitors start searching for your region or its towns.
        </EmptyState>
      ) : (
        insights.byRegion.map(r => <RegionDemand key={r.region.slug} r={r} />)
      )}
    </div>
  )
}

function RegionDemand({ r }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <StatCard
          label={`Searches naming ${r.region.name}`}
          value={r.totalSearches}
          delta={<DeltaBadge current={r.totalSearches} previous={r.previousSearches} />}
        />
        <StatCard label="Distinct search topics" value={r.topQueries.length ? new Set(r.topQueries.map(q => q.query)).size : 0} sub="in the top interest list" />
        <StatCard label="Demand gaps found" value={r.gaps.length} sub="searches with thin results" accent={r.gaps.length ? 'var(--color-accent)' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {/* Top queries */}
        <Card>
          <SectionTitle note="Most-searched phrases matching your region and its towns.">What visitors search for</SectionTitle>
          {r.topQueries.length === 0 ? (
            <p style={emptyText}>No region-specific searches in this period.</p>
          ) : (
            <BarRows rows={r.topQueries.map(q => ({ label: `“${q.query}”`, value: q.count }))} />
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Trending */}
          <Card>
            <SectionTitle note="Queries growing vs the previous period.">Trending now</SectionTitle>
            {r.trending.length === 0 ? (
              <p style={emptyText}>Nothing trending yet — this fills in as search volume grows.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {r.trending.map((t, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.45rem 0', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--color-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      “{t.query}”
                    </span>
                    <span style={{
                      flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 700,
                      color: 'var(--color-sage-dark)', background: 'rgba(95,138,126,0.14)',
                      borderRadius: 999, padding: '0.12rem 0.5rem',
                    }}>
                      {t.before === 0 ? 'New' : `↑ ${Math.round(t.growth * 100)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Unmet demand */}
          <Card style={{ borderColor: r.gaps.length ? 'rgba(196,96,58,0.4)' : undefined }}>
            <SectionTitle note="Searches that named your region but found fewer than three matching places — visitor demand your region isn't answering yet.">
              Unmet demand
            </SectionTitle>
            {r.gaps.length === 0 ? (
              <p style={emptyText}>No demand gaps detected — searches for your region are finding results.</p>
            ) : (
              <>
                <ul style={{ listStyle: 'none', margin: '0 0 0.9rem', padding: 0 }}>
                  {r.gaps.map((g, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.45rem 0', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--color-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        “{g.query}”
                      </span>
                      <span style={{ flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-accent)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {g.count}× searched · ~{Math.round(g.avgResults)} result{Math.round(g.avgResults) === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.55, margin: 0 }}>
                  Know a local operator who answers one of these?{' '}
                  <Link href="/council/feedback" style={{ color: 'var(--color-sage-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    Suggest them
                  </Link>{' '}
                  and our editorial team will assess them for the Atlas — operators always opt in themselves.
                </p>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

const emptyText = { fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--color-muted)', margin: 0 }
