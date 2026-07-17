'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Card, PageHeader, SectionTitle, StatCard, EmptyState, Button, SkeletonPage,
  AdditionRow, verticalName, fmtDate, regionMapImage,
} from '@/components/press/ui'
import { getPublicVerticals } from '@/lib/verticalUrl'

// Your regions — the follow manager (the beat map that drives notifications)
// plus a citable fact sheet per region (?r=slug).

const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']
const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}
const VERTICALS = getPublicVerticals()

export default function PressRegionsPage() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null) // regionId being toggled
  const searchParams = useSearchParams()
  const selected = searchParams.get('r')

  async function load() {
    const url = `/api/press/data?view=regions${selected ? `&region=${encodeURIComponent(selected)}` : ''}`
    const res = await fetch(url)
    if (res.ok) setData(await res.json())
  }

  useEffect(() => { load() }, [selected])

  async function toggleFollow(region, isFollowed) {
    setBusy(region.id)
    try {
      await fetch('/api/press/follows', {
        method: isFollowed ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionId: region.id }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <SkeletonPage />

  const followedIds = new Set(data.followedIds || [])
  const byState = {}
  for (const r of data.allRegions || []) {
    if (!byState[r.state]) byState[r.state] = []
    byState[r.state].push(r)
  }
  const fs = data.factSheet
  const fsMap = fs ? regionMapImage(fs.region, { width: 900, height: 220 }) : null

  return (
    <div>
      <PageHeader
        title="Your regions"
        subtitle="Follow the places you cover. Events, new listings and signals from followed regions land on your newsdesk — and in your inbox, at the pace you set."
      >
        <Button href="/api/press/export?type=regions" variant="secondary" small download>
          Region data (CSV)
        </Button>
      </PageHeader>

      {/* Fact sheet for the selected region */}
      {fs && (
        <Card style={{ padding: 0, marginBottom: '1.9rem', border: '1px solid rgba(28,26,23,0.22)', overflow: 'hidden' }}>
          {fsMap && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={fsMap} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
          )}
          <div style={{ padding: '1.4rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
              <SectionTitle note={`Fact sheet · figures as of ${fmtDate(fs.asOf)} · cite as “Source: Australian Atlas”`}>
                {fs.region.name}
              </SectionTitle>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button href={`/newsroom/find?region=${fs.region.slug}`} variant="primary" small>
                  Find a story here
                </Button>
                <Button href={`/api/press/export?type=listings&region=${fs.region.slug}`} variant="secondary" small download>
                  Every place (CSV)
                </Button>
                <Button href={`/regions/${fs.region.slug}`} variant="ghost" small target="_blank">
                  Public page ↗
                </Button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '0.4rem 0 1.2rem' }}>
              <StatCard label="Independent places" value={fs.total} />
              <StatCard label="Added, 30 days" value={fs.new30} />
              <StatCard label="Added, 90 days" value={fs.new90} />
              <StatCard label="Upcoming events" value={fs.upcomingEvents} />
              <StatCard label="Owner-claimed" value={fs.claimed} sub={fs.total ? `${Math.round((fs.claimed / fs.total) * 100)}% of listings` : null} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
                  What&apos;s here
                </p>
                {VERTICALS.filter(k => fs.byVertical[k] > 0).map(k => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.32rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-ink)' }}>{verticalName(k)}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--color-ink)' }}>{fs.byVertical[k]}</span>
                  </div>
                ))}
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
                  Latest additions
                </p>
                {fs.recentAdditions.length === 0 ? (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted)' }}>Nothing in the last 30 days.</p>
                ) : (
                  fs.recentAdditions.map(l => <AdditionRow key={l.id} listing={l} />)
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Follow manager, grouped by state */}
      {STATES.filter(s => byState[s]?.length).map(state => (
        <div key={state} style={{ marginBottom: '1.6rem' }}>
          <SectionTitle>{STATE_NAMES[state]}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {byState[state].map(region => {
              const isFollowed = followedIds.has(region.id)
              return (
                <div
                  key={region.id}
                  style={{
                    background: isFollowed ? 'rgba(95,138,126,0.07)' : 'var(--color-card-bg)',
                    border: `1px solid ${isFollowed ? 'rgba(95,138,126,0.4)' : 'var(--color-border)'}`,
                    borderRadius: 12, padding: '0.85rem 1rem',
                    display: 'flex', flexDirection: 'column', gap: '0.55rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
                    <Link
                      href={`/newsroom/regions?r=${region.slug}`}
                      style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem', color: 'var(--color-ink)', textDecoration: 'none', lineHeight: 1.25 }}
                    >
                      {region.name}
                    </Link>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-muted)', flexShrink: 0 }}>
                      {region.listing_count || 0} places
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => toggleFollow(region, isFollowed)}
                      disabled={busy === region.id}
                      style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.76rem', fontWeight: 650, cursor: 'pointer',
                        borderRadius: 999, padding: '0.32rem 0.85rem',
                        background: isFollowed ? 'transparent' : 'var(--color-sage)',
                        color: isFollowed ? 'var(--color-sage-dark)' : '#fff',
                        border: isFollowed ? '1px solid rgba(95,138,126,0.45)' : '1px solid transparent',
                        opacity: busy === region.id ? 0.6 : 1,
                      }}
                    >
                      {busy === region.id ? '…' : isFollowed ? 'Following ✓' : 'Follow'}
                    </button>
                    <Link
                      href={`/newsroom/regions?r=${region.slug}`}
                      style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted)', textDecoration: 'none' }}
                    >
                      Fact sheet →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {(data.allRegions || []).length === 0 && (
        <EmptyState title="No live regions yet">
          As regions go live on Australian Atlas they appear here to follow.
        </EmptyState>
      )}
    </div>
  )
}
