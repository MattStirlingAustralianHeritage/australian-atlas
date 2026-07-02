'use client'

import { useState } from 'react'
import EmbedSnippet from './EmbedSnippet'

// Region-scoped council tools: a live embed snippet (retention) and a point-in-time
// report (conversion), per region. `regions` comes from the authenticated council
// account (server-validated in /api/council/data) — a council only ever sees, embeds,
// or reports on its own region(s).
const RANGES = [
  ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'],
  ['1y', 'Last 12 months'],
]

export default function CouncilRegionTools({ regions }) {
  // No silent empty state: say plainly when there's nothing to act on.
  if (!regions?.length) {
    return (
      <section style={{ marginBottom: '2rem' }}>
        <SectionHeading>Embed &amp; reports</SectionHeading>
        <Card>
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', margin: 0, fontSize: '0.9rem' }}>
            No regions assigned to your account yet, so there is nothing to embed or report on. Contact
            councils@australianatlas.com.au to get your region set up.
          </p>
        </Card>
      </section>
    )
  }

  return (
    <section style={{ marginBottom: '2rem' }}>
      <SectionHeading>Embed &amp; reports</SectionHeading>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>
        For each of your regions: a <strong>live</strong> map to embed on your own site (always current),
        and a <strong>point-in-time</strong> report you can save as a PDF for board and econ-dev packs.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {regions.map((region) => (
          <details
            key={region.id}
            style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1rem 1.25rem' }}
          >
            <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500, color: 'var(--color-ink)', fontSize: '0.95rem' }}>
              {region.name}
              <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>{region.state ? ` · ${region.state}` : ''}</span>
            </summary>

            <div style={{ marginTop: '1.1rem' }}>
              <Subheading>Embed your region map <Tag tone="live">Live</Tag></Subheading>
              <p style={subNote}>A live map of the independent operators in your region — updates automatically as the Atlas does.</p>
              <EmbedSnippet slug={region.slug} regionName={region.name} />
            </div>

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.1rem' }}>
              <Subheading>Generate a report <Tag tone="snapshot">Snapshot</Tag></Subheading>
              <p style={subNote}>A dated, point-in-time snapshot — figures are frozen as at the day you generate it. Save as PDF via your browser&rsquo;s Print dialog.</p>
              <RegionReportLinks slug={region.slug} />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function RegionReportLinks({ slug }) {
  const [range, setRange] = useState('90d')
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.7rem' }}>
        {RANGES.map(([value, label]) => {
          const active = range === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setRange(value)}
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: 999,
                border: `1px solid ${active ? 'var(--color-sage)' : 'var(--color-border)'}`,
                background: active ? 'var(--color-sage)' : '#fff',
                color: active ? '#fff' : 'var(--color-ink)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
      <a
        href={`/council/${slug}/report?range=${range}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          padding: '0.5rem 1.1rem',
          borderRadius: 8,
          background: 'var(--color-sage)',
          color: '#fff',
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        Open report ↗
      </a>
    </div>
  )
}

const subNote = { fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', margin: '0 0 0.7rem' }

function Subheading({ children }) {
  return (
    <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {children}
    </h3>
  )
}

function Tag({ tone, children }) {
  const live = tone === 'live'
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '0.12rem 0.45rem', borderRadius: 999,
      background: live ? 'rgba(95,138,126,0.12)' : 'rgba(184,134,43,0.12)',
      color: live ? 'var(--color-sage)' : '#9a6a1a',
    }}>
      {children}
    </span>
  )
}

function SectionHeading({ children }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 400, color: 'var(--color-ink)', margin: '0 0 1rem' }}>
      {children}
    </h2>
  )
}

function Card({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem' }}>
      {children}
    </div>
  )
}
