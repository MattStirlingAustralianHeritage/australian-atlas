'use client'

import EmbedSnippet from './EmbedSnippet'

// Region-scoped council tools: embed snippet (P2). The report generator is added
// alongside in P4. `regions` comes from the authenticated council account
// (server-validated in /api/council/data) — a council only ever sees its own.
export default function CouncilRegionTools({ regions }) {
  // No silent empty state: say plainly when there's nothing to act on.
  if (!regions?.length) {
    return (
      <section style={{ marginBottom: '2rem' }}>
        <SectionHeading>Embed your region</SectionHeading>
        <Card>
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', margin: 0, fontSize: '0.9rem' }}>
            No regions assigned to your account yet, so there is nothing to embed. Contact
            councils@australianatlas.com.au to get your region set up.
          </p>
        </Card>
      </section>
    )
  }

  return (
    <section style={{ marginBottom: '2rem' }}>
      <SectionHeading>Embed your region</SectionHeading>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>
        A live, always-current map of the independent operators in your region — paste it into your
        own website. It updates automatically as the Atlas does.
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
            <div style={{ marginTop: '1rem' }}>
              <EmbedSnippet slug={region.slug} regionName={region.name} />
            </div>
          </details>
        ))}
      </div>
    </section>
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
