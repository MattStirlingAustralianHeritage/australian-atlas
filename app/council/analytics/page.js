'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const RANGE_LABELS = { '30d': 'Last 30 days', '90d': 'Last 90 days', '1y': 'Last 12 months' }

export default function CouncilAnalytics() {
  const { council, regions } = useCouncil()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('90d')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/council/data?view=analytics&range=${range}`)
      .then(r => r.json())
      .then(d => {
        setData(d.analytics || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [range])

  if (!council) return null

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
            Analytics
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0 }}>
            How your region performs across the Atlas network
          </p>
        </div>
        <select
          value={range}
          onChange={e => setRange(e.target.value)}
          style={{
            fontFamily: 'var(--font-body)', fontSize: '0.85rem', padding: '0.45rem 0.75rem',
            borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)',
          }}
        >
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last 12 months</option>
        </select>
      </div>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading…</p>
      ) : data ? (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>
            {RANGE_LABELS[data.period] || 'Last 90 days'} · {regions.length} region{regions.length !== 1 ? 's' : ''} · datacenter &amp; crawler traffic excluded
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <StatCard label="Region page views" value={data.views} />
            <StatCard label="Listing clicks" value={data.clicks} />
            <StatCard label="Search interest" value={data.searches} />
            <StatCard label="Listings added" value={data.newListings} />
          </div>

          {(data.regions || []).length === 0 ? (
            <Empty>No regions assigned yet.</Empty>
          ) : (
            (data.regions || []).map(m => <RegionBlock key={m.region.slug} m={m} />)
          )}
        </>
      ) : (
        <Empty>No analytics data available yet. Data appears here once your listings receive traffic.</Empty>
      )}
    </div>
  )
}

function RegionBlock({ m }) {
  const hasAny = m.regionPageViews || m.totalClicks || m.topListings.length || m.topSearches.length
  return (
    <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
          {m.region.name}
        </h2>
        <Link
          href={`/council/${m.region.slug}/report`}
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-sage)', textDecoration: 'none' }}
        >
          View / print full report →
        </Link>
      </div>

      {!hasAny ? (
        <Empty>No recorded traffic for this region in this period yet.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          <MiniList title="Most-viewed places" rows={m.topListings.map(l => ({ label: l.name, sub: l.verticalLabel, value: l.clicks }))} empty="No place views yet." />
          <MiniList title="Visitor origin" rows={m.visitorOrigin.map(o => ({ label: o.city, sub: o.area || o.country, value: o.count }))} empty="Not enough located visits." />
          <MiniList title="Search interest" rows={m.topSearches.map(s => ({ label: `“${s.query}”`, value: s.count }))} empty="No region searches yet." />
        </div>
      )}
    </section>
  )
}

function MiniList({ title, rows, empty }) {
  return (
    <div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', margin: '0 0 0.6rem' }}>
        {title}
      </p>
      {rows.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', margin: 0 }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--color-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}{r.sub ? <span style={{ color: 'var(--color-muted)' }}>{` · ${r.sub}`}</span> : null}
              </span>
              <span style={{ color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{r.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', textAlign: 'center' }}>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
        {typeof value === 'number' ? value.toLocaleString() : (value || 0)}
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', margin: 0 }}>
        {label}
      </p>
    </div>
  )
}

function Empty({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '2rem', textAlign: 'center' }}>
      <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', margin: 0 }}>{children}</p>
    </div>
  )
}
