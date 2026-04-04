import Link from 'next/link'

export const metadata = {
  title: 'API for Developers — Australian Atlas',
  description: 'Access verified independent listing data across nine curated directories via the Australian Atlas API.',
}

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/venues',
    desc: 'List all verified venues. Filter by vertical, region, state.',
    params: ['vertical', 'region', 'state', 'limit (max 200)', 'offset'],
  },
  {
    method: 'GET',
    path: '/api/v1/venues/{id}',
    desc: 'Get a single venue by ID.',
    params: [],
  },
  {
    method: 'GET',
    path: '/api/v1/regions',
    desc: 'List all mapped regions. Filter by state.',
    params: ['state'],
  },
  {
    method: 'GET',
    path: '/api/v1/regions/{slug}/venues',
    desc: 'List all venues in a specific region. Filter by vertical.',
    params: ['vertical', 'limit (max 500)', 'offset'],
  },
]

const USE_CASES = [
  { title: 'Tourism app developers', desc: 'Integrate verified independent venue data into your travel or discovery app.' },
  { title: 'Regional council GIS', desc: 'Pull independent business data for spatial analysis and regional planning.' },
  { title: 'Travel writers', desc: 'Build custom itineraries from verified listing data across nine categories.' },
  { title: 'Researchers', desc: 'Study independent business distribution, regional economic patterns, and cultural geography across Australia.' },
]

export default function DevelopersPage() {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ padding: '5rem 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          For Developers
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '2.5rem',
          color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: '1rem',
        }}>
          The Atlas API
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 16,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 560,
        }}>
          Read-only access to verified, curated data on independent businesses across Australia. Nine verticals, 46+ regions, updated continuously.
        </p>
      </section>

      {/* Auth */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{
          padding: '24px 28px', borderRadius: 10,
          background: 'var(--color-cream)', border: '1px solid var(--color-border)',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
            color: 'var(--color-ink)', marginBottom: 8,
          }}>Authentication</h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
            color: 'var(--color-muted)', lineHeight: 1.55, marginBottom: 12,
          }}>
            All requests require an API key passed via the <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>x-api-key</code> header or <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>api_key</code> query parameter.
          </p>
          <div style={{
            background: '#1a1a1a', color: '#e0e0e0', padding: '14px 18px',
            borderRadius: 6, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6,
            overflowX: 'auto',
          }}>
            <span style={{ color: '#6b9' }}>curl</span> https://australianatlas.com.au/api/v1/venues \<br />
            &nbsp;&nbsp;-H <span style={{ color: '#fc6' }}>"x-api-key: atlas_pk_your_key_here"</span>
          </div>
        </div>
      </section>

      {/* Rate limits */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>Rate Limits</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: '16px 20px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--color-ink)', marginBottom: 4 }}>Free</p>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>1,000 requests/day</p>
          </div>
          <div style={{ padding: '16px 20px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--color-ink)', marginBottom: 4 }}>Partner</p>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>10,000 requests/day</p>
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>Endpoints</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {ENDPOINTS.map(ep => (
            <div key={ep.path} style={{
              padding: '18px 22px', borderRadius: 8,
              border: '1px solid var(--color-border)', background: '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                  color: '#fff', background: 'var(--color-sage)',
                  padding: '2px 8px', borderRadius: 4,
                }}>{ep.method}</span>
                <code style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-ink)' }}>{ep.path}</code>
              </div>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13,
                color: 'var(--color-muted)', margin: '0 0 6px',
              }}>{ep.desc}</p>
              {ep.params.length > 0 && (
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11,
                  color: 'var(--color-muted)', margin: 0,
                }}>
                  Params: {ep.params.map(p => <code key={p} style={{ background: 'var(--color-cream)', padding: '1px 5px', borderRadius: 3, fontSize: 11, marginRight: 4 }}>{p}</code>)}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Response format */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>Response Format</h2>
        <div style={{
          background: '#1a1a1a', color: '#e0e0e0', padding: '18px 22px',
          borderRadius: 8, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
          overflowX: 'auto',
        }}>
          {`{
  "data": [
    {
      "id": "uuid",
      "name": "Turkey Flat Vineyards",
      "slug": "turkey-flat-vineyards",
      "vertical": "sba",
      "category": "winery",
      "description": "...",
      "suburb": "Tanunda",
      "state": "SA",
      "region": "Barossa Valley",
      "lat": -34.529,
      "lng": 138.961,
      "is_claimed": true,
      "is_featured": true
    }
  ],
  "meta": {
    "total": 847,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}`}
        </div>
      </section>

      {/* Use cases */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>Use Cases</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {USE_CASES.map(uc => (
            <div key={uc.title} style={{
              padding: '16px 20px', borderRadius: 8,
              border: '1px solid var(--color-border)', background: '#fff',
            }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--color-ink)', marginBottom: 4 }}>{uc.title}</p>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', margin: 0, lineHeight: 1.45 }}>{uc.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Data policy */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>Data Policy</h2>
        <div style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
          color: 'var(--color-muted)', lineHeight: 1.6,
        }}>
          <p>The API does not expose PII, contact details of unclaimed venues, or internal scoring data. All data returned is already publicly visible on the Atlas Network websites.</p>
          <p style={{ marginTop: 12 }}>Attribution is required: include "Data from Australian Atlas" with a link to australianatlas.com.au in any public-facing use of the data.</p>
        </div>
      </section>

      {/* Get key CTA */}
      <section style={{ padding: '0 1.5rem 5rem', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          padding: '36px 28px', borderRadius: 12,
          background: 'var(--color-ink)', color: '#fff',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.5rem',
            color: '#fff', marginBottom: 8,
          }}>Get an API key</h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
            color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 20,
            maxWidth: 400, marginLeft: 'auto', marginRight: 'auto',
          }}>
            API keys are issued on request. Tell us what you are building and we will get you set up.
          </p>
          <a
            href="mailto:api@australianatlas.com.au?subject=Atlas API key request"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 6,
              background: 'var(--color-accent)', color: '#fff',
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Request API access
          </a>
        </div>
      </section>
    </div>
  )
}
