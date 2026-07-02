'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, PageHeader, SectionTitle, StatCard, EmptyState, RangePicker, Skeleton } from '@/components/council/ui'
import { TrendChart, BarRows, DeltaBadge } from '@/components/council/charts'

const RANGE_LABELS = { '30d': 'Last 30 days', '90d': 'Last 90 days', '1y': 'Last 12 months' }

export default function CouncilAnalytics() {
  const { council, regions } = useCouncil()
  const [range, setRange] = useState('90d')
  const [analytics, setAnalytics] = useState(null)
  const [trends, setTrends] = useState(null)
  const [benchmarks, setBenchmarks] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch(`/api/council/data?view=analytics&range=${range}`).then(r => r.json()),
      fetch(`/api/council/data?view=trends&range=${range}`).then(r => r.json()),
      fetch(`/api/council/data?view=benchmarks&range=${range}`).then(r => r.json()),
    ])
      .then(([a, t, b]) => {
        if (cancelled) return
        setAnalytics(a.analytics || null)
        setTrends(t.trends || null)
        setBenchmarks(b.benchmarks || null)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range])

  if (!council) return null

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Visitor interest in your region across the Atlas network — page views, listing clicks, origins and search interest, bot-filtered."
      >
        <RangePicker value={range} onChange={setRange} />
      </PageHeader>

      {loading ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <Skeleton height={110} /><Skeleton height={110} /><Skeleton height={110} /><Skeleton height={110} />
          </div>
          <Skeleton height={280} style={{ marginBottom: '1.5rem' }} />
          <Skeleton height={200} />
        </>
      ) : !analytics ? (
        <EmptyState title="No analytics yet">
          Data appears here once your region&apos;s listings receive traffic.
        </EmptyState>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>
            {RANGE_LABELS[range]} · {regions.length} region{regions.length !== 1 ? 's' : ''} · datacenter &amp; crawler traffic excluded
          </p>

          {/* Headline figures with deltas vs previous period */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <StatCard
              label="Region page views"
              value={analytics.views}
              delta={<DeltaBadge current={trends?.current?.views} previous={trends?.previous?.views} />}
            />
            <StatCard
              label="Listing clicks"
              value={analytics.clicks}
              delta={<DeltaBadge current={trends?.current?.clicks} previous={trends?.previous?.clicks} />}
            />
            <StatCard label="Unique visitors" value={trends?.current?.visitors ?? 0} />
            <StatCard label="Search interest" value={analytics.searches} sub="searches naming your region" />
          </div>

          {/* Weekly trend */}
          <Card style={{ marginBottom: '1.5rem' }}>
            <SectionTitle note="Weekly buckets over the selected window. The previous period is used for the change badges above.">
              Weekly trend
            </SectionTitle>
            <TrendChart series={trends?.series || []} />
          </Card>

          {/* Benchmark */}
          {benchmarks?.byRegion?.length > 0 && (
            <Card style={{ marginBottom: '1.5rem', background: 'var(--color-cream)' }}>
              <SectionTitle note={`Compared with all ${benchmarks.totalRegions} published Atlas regions over the same window.`}>
                How your region compares
              </SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                {benchmarks.byRegion.map(b => (
                  <div key={b.region.slug} style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.1rem 1.25rem' }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
                      {b.region.name}
                    </p>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 430, color: 'var(--color-ink)', margin: '0 0 0.2rem' }}>
                      #{b.rank ?? '—'}
                      <span style={{ fontSize: '0.95rem', color: 'var(--color-muted)' }}> of {b.of}</span>
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0 0 0.65rem' }}>
                      by visitor interest{typeof b.percentile === 'number' ? ` · top ${Math.max(1, 100 - b.percentile)}%` : ''}
                    </p>
                    <BenchRow label="Listing clicks" mine={b.clicks} median={benchmarks.medians.clicks} />
                    <BenchRow label="Clicks per listing" mine={b.clicksPerListing} median={Number(benchmarks.medians.clicksPerListing?.toFixed?.(2) ?? benchmarks.medians.clicksPerListing)} />
                    <BenchRow label="Listings" mine={b.listings} median={benchmarks.medians.listings} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Per-region detail */}
          {(analytics.regions || []).map(m => {
            const t = trends?.byRegion?.find(r => r.region.slug === m.region.slug)
            return <RegionBlock key={m.region.slug} m={m} t={t} />
          })}
        </>
      )}
    </div>
  )
}

function BenchRow({ label, mine, median }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.3rem 0', borderTop: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
      <span style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>
        {(mine ?? 0).toLocaleString()} <span style={{ color: 'var(--color-muted)' }}>· median {(median ?? 0).toLocaleString()}</span>
      </span>
    </div>
  )
}

function RegionBlock({ m, t }) {
  const hasAny = m.regionPageViews || m.totalClicks || m.topListings.length || m.topSearches.length
  const split = t?.split
  const located = split ? split.local + split.visiting : 0

  return (
    <Card style={{ marginBottom: '1.25rem' }}>
      <SectionTitle
        action={
          <Link
            href={`/council/${m.region.slug}/report`}
            target="_blank"
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 550, color: 'var(--color-sage-dark)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Print-ready report ↗
          </Link>
        }
      >
        {m.region.name}
      </SectionTitle>

      {!hasAny ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0 }}>
          No recorded traffic for this region in this period yet.
        </p>
      ) : (
        <>
          {/* Local vs visiting */}
          {located > 3 && (
            <div style={{ marginBottom: '1.35rem' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
                Local vs visiting interest
              </p>
              <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'rgba(28,26,23,0.07)' }}>
                <div style={{ width: `${(split.visiting / located) * 100}%`, background: 'var(--color-sage)' }} />
                <div style={{ width: `${(split.local / located) * 100}%`, background: 'var(--color-gold)' }} />
              </div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0.4rem 0 0' }}>
                <span style={{ color: 'var(--color-sage-dark)', fontWeight: 600 }}>{Math.round((split.visiting / located) * 100)}% visiting</span>
                {' · '}
                <span style={{ fontWeight: 600, color: '#8a6a24' }}>{Math.round((split.local / located) * 100)}% local</span>
                {' — '}browsing location vs your region (IP-based, approximate).
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.5rem' }}>
            <MiniList
              title="Most-viewed places"
              rows={m.topListings.map(l => ({ label: l.name, sub: l.verticalLabel, value: l.clicks }))}
              empty="No place views yet."
            />
            <MiniList
              title="Visitor origin"
              rows={m.visitorOrigin.map(o => ({ label: o.city, sub: o.area || o.country, value: o.count }))}
              empty="Not enough located visits."
            />
            <MiniList
              title="Search interest"
              rows={m.topSearches.map(s => ({ label: `“${s.query}”`, value: s.count }))}
              empty="No region searches yet."
              footer={<Link href="/council/demand" style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-sage-dark)', textDecoration: 'none' }}>Full demand analysis →</Link>}
            />
          </div>
        </>
      )}
    </Card>
  )
}

function MiniList({ title, rows, empty, footer }) {
  return (
    <div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', margin: '0 0 0.6rem' }}>
        {title}
      </p>
      {rows.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', margin: 0 }}>{empty}</p>
      ) : (
        <BarRows rows={rows} />
      )}
      {footer && <div style={{ marginTop: '0.6rem' }}>{footer}</div>}
    </div>
  )
}
