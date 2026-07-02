'use client'

import { useCouncil } from './layout'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getVerticalLabel, VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import { Card, PageHeader, SectionTitle, StatCard, EmptyState, Button, Skeleton, regionMapImage } from '@/components/council/ui'
import { Sparkline, DeltaBadge, TrendChart, BarRows } from '@/components/council/charts'

const timeGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const ACTIVITY_LABELS = {
  login: 'Signed in to the dashboard',
  view_report: 'Opened a region report',
  create_content: 'Drafted content',
  content_created: 'Drafted content',
  content_submitted: 'Sent content to the editorial desk',
  feedback: 'Sent feedback to the Atlas team',
  logo_updated: 'Updated the council logo',
  digest_sent: 'Monthly Region Pulse delivered',
}

export default function CouncilOverview() {
  const { council, regions, stats, activity } = useCouncil()
  const [trends, setTrends] = useState(null)
  const [trendsLoading, setTrendsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/council/data?view=trends&range=90d')
      .then(r => r.json())
      .then(d => { setTrends(d.trends || null); setTrendsLoading(false) })
      .catch(() => setTrendsLoading(false))
  }, [])

  if (!council) return null

  const firstRegion = regions[0]
  const regionNames = regions.map(r => r.name).join(', ')
  const sparkOf = (key) => (trends?.series || []).map(s => s[key])

  return (
    <div>
      <PageHeader
        title={timeGreeting()}
        subtitle={regions.length
          ? `How ${regionNames} ${regions.length > 1 ? 'are' : 'is'} performing across the Atlas network.`
          : `${council.name} — founding partner.`}
      >
        {firstRegion && (
          <Button href={`/council/${firstRegion.slug}/report`} target="_blank" variant="primary" small>
            Open region report ↗
          </Button>
        )}
        <Button href="/api/council/export" variant="secondary" small>Export CSV</Button>
      </PageHeader>

      {/* Headline figures — 90-day window with deltas vs the previous 90 days */}
      {trendsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Skeleton height={128} /><Skeleton height={128} /><Skeleton height={128} /><Skeleton height={128} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard
            label="Page views · 90 days"
            value={trends?.current?.views ?? 0}
            delta={<DeltaBadge current={trends?.current?.views} previous={trends?.previous?.views} />}
            spark={<Sparkline data={sparkOf('views')} />}
          />
          <StatCard
            label="Listing clicks · 90 days"
            value={trends?.current?.clicks ?? 0}
            delta={<DeltaBadge current={trends?.current?.clicks} previous={trends?.previous?.clicks} />}
            spark={<Sparkline data={sparkOf('clicks')} color="#C4603A" />}
          />
          <StatCard
            label="Unique visitors · 90 days"
            value={trends?.current?.visitors ?? 0}
          />
          <StatCard
            label="Listings in your regions"
            value={stats.totalListings || 0}
            sub={`across ${Object.keys(stats.listingsByVertical || {}).length} categories`}
          />
        </div>
      )}

      {/* 90-day trend */}
      <Card style={{ marginBottom: '1.75rem' }}>
        <SectionTitle
          note="Weekly page views and listing clicks for your regions, bot-filtered."
          action={
            <Link href="/council/analytics" style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 550, color: 'var(--color-sage-dark)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Full analytics →
            </Link>
          }
        >
          Interest in your region{regions.length > 1 ? 's' : ''}
        </SectionTitle>
        {trendsLoading ? (
          <Skeleton height={200} />
        ) : (
          <TrendChart series={trends?.series || []} height={210} />
        )}
      </Card>

      {/* Regions + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
        <section>
          <SectionTitle>Your region{regions.length !== 1 ? 's' : ''}</SectionTitle>
          {regions.length === 0 ? (
            <EmptyState title="No regions assigned yet">
              Contact councils@australianatlas.com.au and we&apos;ll link your council to its region.
            </EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {regions.map(region => (
                <Link key={region.id} href={`/council/region?r=${region.slug}`} style={{ textDecoration: 'none' }}>
                  <Card hover style={{ padding: 0, overflow: 'hidden' }}>
                    {regionMapImage(region) && (
                      <div style={{
                        height: 96,
                        background: `url(${regionMapImage(region, { width: 800, height: 120 })}) center/cover`,
                        borderBottom: '1px solid var(--color-border)',
                      }} />
                    )}
                    <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.08rem', fontWeight: 450, color: 'var(--color-ink)', margin: '0 0 0.15rem' }}>
                          {region.name}
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: 0 }}>
                          {region.state} · {(region.listing_count || 0).toLocaleString()} listings
                        </p>
                      </div>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-sage-dark)', flexShrink: 0 }}>
                        Explore →
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>Recent activity</SectionTitle>
          {(activity || []).length === 0 ? (
            <EmptyState>Activity on your account — logins, reports, content, feedback — appears here.</EmptyState>
          ) : (
            <Card style={{ padding: '0.5rem 1.25rem' }}>
              {activity.slice(0, 7).map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.65rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--color-ink)' }}>
                    {ACTIVITY_LABELS[a.action] || a.action}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-muted)', flexShrink: 0 }}>
                    {new Date(a.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>

      {/* Listings by category */}
      {Object.keys(stats.listingsByVertical || {}).length > 0 && (
        <section style={{ marginBottom: '1.75rem' }}>
          <SectionTitle note="Venue count per Atlas category across your regions.">Listings by category</SectionTitle>
          <Card>
            <BarRows
              rows={Object.entries(stats.listingsByVertical)
                .sort((a, b) => b[1] - a[1])
                .map(([vertical, count]) => ({
                  label: `${getVerticalLabel(vertical)} Atlas`,
                  value: count,
                  color: VERTICAL_ACCENTS[vertical] || 'var(--color-sage)',
                }))}
            />
          </Card>
        </section>
      )}

      {/* Founding partner */}
      <Card style={{ background: 'var(--color-cream)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-ink)', margin: '0 0 0.35rem' }}>
              Founding partner — free during beta
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
              You have the full council toolkit: live analytics, search-demand insights, the digital presence
              audit, white-label reports, CSV export, an embeddable region map and a monthly Region Pulse
              email. Something missing?{' '}
              <Link href="/council/feedback" style={{ color: 'var(--color-sage-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Tell us
              </Link>{' '}
              — founding partners steer the roadmap.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
