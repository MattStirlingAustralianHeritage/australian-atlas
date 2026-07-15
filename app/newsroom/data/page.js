'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Card, PageHeader, SectionTitle, StatCard, Button, SkeletonPage, fmtDate,
} from '@/components/press/ui'

// The data room — citable numbers, downloads, and the methodology that makes
// them printable. Everything here is free to use with attribution.

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

export default function PressDataPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/press/data?view=data')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
  }, [])

  if (!data) return <SkeletonPage />

  const n = data.network || {}
  const rows = (data.regionTable || []).slice().sort((a, b) => b.total - a.total)

  return (
    <div>
      <PageHeader
        title="Data room"
        subtitle={`Live numbers from the Australian Atlas, current as of ${fmtDate(n.asOf)}. Free to publish with attribution.`}
      />

      {/* Headline network numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: '1.9rem' }}>
        <StatCard label="Independent places" value={(n.listings ?? 0).toLocaleString()} sub="listed across Australia" />
        <StatCard label="Live regions" value={n.liveRegions ?? 0} />
        <StatCard label="Added last 30 days" value={n.newListings30 ?? 0} />
        <StatCard label="Upcoming events" value={n.upcomingEvents ?? 0} />
        <StatCard label="Atlases" value={n.verticals ?? 10} sub="breweries to bookshops, stays to trails" />
      </div>

      {/* Downloads */}
      <div style={{ marginBottom: '1.9rem' }}>
        <SectionTitle note="CSV, opens in any spreadsheet — regenerated live on every download">Downloads</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          {[
            { href: '/api/press/export?type=regions', title: 'Regions dataset', desc: 'Every live region with total places, 30-day additions, and the split across all ten atlases. The quickest route to a local data story.' },
            { href: '/api/press/export?type=listings', title: 'Places in your regions', desc: 'Every listed independent in the regions you follow — name, category, town, website, date listed, public URL.' },
            { href: '/api/press/export?type=events', title: 'Events in your regions', desc: 'Every upcoming event — dates, venue, category, ticket link. Ready for a what’s-on column.' },
          ].map(d => (
            <Card key={d.href} style={{ padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-ink)', margin: 0 }}>{d.title}</p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.55, margin: 0, flex: 1 }}>{d.desc}</p>
              <div><Button href={d.href} variant="secondary" small download>Download CSV</Button></div>
            </Card>
          ))}
        </div>
      </div>

      {/* Region table */}
      <div style={{ marginBottom: '1.9rem' }}>
        <SectionTitle note="click a region for its full fact sheet">Region by region</SectionTitle>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(28,26,23,0.22)' }}>
                  {['Region', 'State', 'Places', 'Added, 30 days'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Region' || h === 'State' ? 'left' : 'right', padding: '0.7rem 1.1rem', fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <td style={{ padding: '0.55rem 1.1rem' }}>
                      <Link href={`/newsroom/regions?r=${r.slug}`} style={{ color: 'var(--color-ink)', textDecoration: 'none', fontWeight: 550 }}>
                        {r.name}
                      </Link>
                    </td>
                    <td style={{ padding: '0.55rem 1.1rem', color: 'var(--color-muted)' }}>
                      {STATE_NAMES[r.state] || r.state}
                    </td>
                    <td style={{ padding: '0.55rem 1.1rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.total}</td>
                    <td style={{ padding: '0.55rem 1.1rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.new30 > 0 ? 'var(--color-sage-dark)' : 'var(--color-muted)' }}>
                      {r.new30 > 0 ? `+${r.new30}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Methodology + citation */}
      <Card style={{ padding: '1.3rem 1.4rem' }}>
        <SectionTitle>Methodology &amp; how to cite</SectionTitle>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 0.8rem' }}>
            <strong style={{ color: 'var(--color-ink)' }}>What the numbers are.</strong> Counts of places listed on
            Australian Atlas: independently owned and run venues across ten atlases, added one at a time by our
            editorial process (no chains, no franchises, no paid placement). Listings marked for review are excluded
            from every figure. Dates reflect when a place was listed by us, not when it opened.
          </p>
          <p style={{ margin: '0 0 0.8rem' }}>
            <strong style={{ color: 'var(--color-ink)' }}>What they are not.</strong> Australian Atlas is a curated
            atlas, not a census — treat our figures as “listed on Australian Atlas”, not as a count of every independent
            business in a region. Growth figures partly reflect our own editorial expansion, region by region;
            we&apos;ll always say so if a number is better explained by our coverage than by the high street.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--color-ink)' }}>How to cite.</strong> “Source: Australian Atlas (australianatlas.com.au)”
            with the as-of date shown above. Data on this page and in the downloads is free for editorial use with that
            attribution. Need a custom cut, a time series, or a sanity-check before you publish?{' '}
            <Link href="/newsroom/requests" style={{ color: 'var(--color-sage-dark)' }}>Ask the desk</Link> — same-day reply.
          </p>
        </div>
      </Card>
    </div>
  )
}
