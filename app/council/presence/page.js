'use client'

import { useCouncil } from '../layout'
import { useState, useEffect } from 'react'
import { getVerticalLabel } from '@/lib/verticalUrl'
import { Card, PageHeader, SectionTitle, StatCard, EmptyState, Button, Skeleton } from '@/components/council/ui'

// Digital presence audit — the exportable hit-list a council's small-business
// or digital-capability program works from: which local venues have no
// website, a dead website, or no operator at the wheel.

export default function CouncilPresence() {
  const { council } = useCouncil()
  const [presence, setPresence] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/council/data?view=presence')
      .then(r => r.json())
      .then(d => { setPresence(d.presence || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (!council) return null

  return (
    <div>
      <PageHeader
        title="Digital presence"
        subtitle="An audit of your region's independent operators online: who has no website, whose website appears down, and who hasn't claimed their listing. Roughly six in ten regional Australian small businesses have no website — this is the hit-list for your digital-capability programs."
      />

      {loading ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <Skeleton height={110} /><Skeleton height={110} /><Skeleton height={110} /><Skeleton height={110} />
          </div>
          <Skeleton height={320} />
        </>
      ) : !presence?.byRegion?.length ? (
        <EmptyState title="No regions assigned yet">
          Contact councils@australianatlas.com.au and we&apos;ll link your council to its region.
        </EmptyState>
      ) : (
        presence.byRegion.map(r => <RegionPresence key={r.region.slug} r={r} />)
      )}
    </div>
  )
}

function RegionPresence({ r }) {
  const claimRate = r.total ? Math.round((r.claimed / r.total) * 100) : 0
  return (
    <div style={{ marginBottom: '2.25rem' }}>
      <SectionTitle note={`${r.total.toLocaleString()} active venues in ${r.region.name}.`}>
        {r.region.name}
      </SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <StatCard
          label="Presence score"
          value={r.score != null ? `${r.score}` : '—'}
          sub="share of venues with a working website"
          accent={r.score != null ? (r.score >= 80 ? 'var(--color-sage)' : r.score >= 60 ? 'var(--color-gold)' : 'var(--color-accent)') : undefined}
        />
        <StatCard label="No website" value={r.noWebsite.count} sub="their Atlas page may be their only presence" />
        <StatCard label="Website appears down" value={r.deadWebsite.count} sub="failed our automated checks" />
        <StatCard label="Operator-claimed" value={`${claimRate}%`} sub={`${r.claimed.toLocaleString()} of ${r.total.toLocaleString()} venues`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1rem' }}>
        <HitList
          title="Venues with no website"
          note="Candidates for your digital-capability or web-presence programs."
          rows={r.noWebsite.rows}
          count={r.noWebsite.count}
          exportHref={`/api/council/export?region=${r.region.slug}&type=no-website`}
        />
        <HitList
          title="Websites that appear down"
          note="Link checks failed — worth a nudge before visitors bounce."
          rows={r.deadWebsite.rows}
          count={r.deadWebsite.count}
          exportHref={`/api/council/export?region=${r.region.slug}&type=dead-website`}
          showStatus
        />
      </div>

      <Card style={{ background: 'var(--color-cream)' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: 'var(--color-ink)' }}>Put this to work:</strong> export a hit-list for your
          business-support team, and encourage local operators to claim their Atlas listing — claimed venues
          keep their own details, photos and story up to date, which lifts your region&apos;s score without
          anyone chasing spreadsheets.
        </p>
      </Card>
    </div>
  )
}

function HitList({ title, note, rows, count, exportHref, showStatus }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, 8)
  return (
    <Card style={{ padding: '1.25rem 1.5rem' }}>
      <SectionTitle
        note={note}
        action={count > 0 ? <Button href={exportHref} variant="secondary" small>Export CSV</Button> : null}
      >
        {title}
      </SectionTitle>
      {count === 0 ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--color-sage-dark)', margin: 0 }}>
          None — nothing to chase here. ✓
        </p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.83rem' }}>
            <tbody>
              {visible.map((v, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem 0.5rem 0.5rem 0', color: 'var(--color-ink)', fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                    {getVerticalLabel(v.vertical)}
                  </td>
                  <td style={{ padding: '0.5rem 0 0.5rem 0.5rem', color: 'var(--color-muted)', textAlign: 'right' }}>
                    {showStatus ? (v.websiteStatus || '—') : (v.suburb || '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 8 && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              style={{
                marginTop: '0.7rem', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 550, color: 'var(--color-sage-dark)', padding: 0,
              }}
            >
              {expanded ? 'Show fewer' : `Show all ${rows.length}${count > rows.length ? ` of ${count}` : ''}`}
            </button>
          )}
          {count > rows.length && expanded && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.74rem', color: 'var(--color-muted)', margin: '0.5rem 0 0' }}>
              Showing the first {rows.length}; the CSV export contains all {count}.
            </p>
          )}
        </>
      )}
    </Card>
  )
}
