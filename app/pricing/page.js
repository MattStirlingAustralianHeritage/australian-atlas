import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const metadata = {
  title: 'For Regional Councils — Australian Atlas',
  description: 'Regional intelligence, verified listing data, and editorial tools for tourism bodies and regional councils across Australia.',
}

async function getNetworkStats() {
  try {
    const sb = getSupabaseAdmin()
    const [{ count: listings }, { count: regions }, { count: claimed }] = await Promise.all([
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('regions').select('*', { count: 'exact', head: true }),
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_claimed', true),
    ])

    const verticalCounts = {}
    const verticals = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
    for (const v of verticals) {
      const { count } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('vertical', v).eq('status', 'active')
      verticalCounts[v] = count || 0
    }

    return { listings: listings || 0, regions: regions || 0, claimed: claimed || 0, verticalCounts }
  } catch {
    return { listings: 0, regions: 0, claimed: 0, verticalCounts: {} }
  }
}

const VERTICALS = [
  { key: 'sba', name: 'Small Batch Atlas', what: 'Breweries, wineries, distilleries, cideries' },
  { key: 'collection', name: 'Culture Atlas', what: 'Galleries, museums, heritage sites' },
  { key: 'craft', name: 'Craft Atlas', what: 'Makers, artists, studios' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas', what: 'Specialty roasters, independent cafes' },
  { key: 'rest', name: 'Rest Atlas', what: 'Boutique stays, farm stays, glamping' },
  { key: 'field', name: 'Field Atlas', what: 'Swimming holes, waterfalls, lookouts' },
  { key: 'corner', name: 'Corner Atlas', what: 'Bookshops, records, homewares' },
  { key: 'found', name: 'Found Atlas', what: 'Vintage stores, op shops, antique dealers' },
  { key: 'table', name: 'Table Atlas', what: 'Farm gates, bakeries, providores' },
]

export default async function PricingPage() {
  const stats = await getNetworkStats()

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ padding: '5rem 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          For Regional Councils & Tourism Bodies
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '2.5rem',
          color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: '1.25rem',
        }}>
          The independent layer your region data is missing
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 16,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 600,
        }}>
          ATDW lists the hotels and the chain restaurants. Your council tourism site lists the attractions with the biggest marketing budgets. Neither maps the independent businesses that actually make your region worth visiting — the family-run cellar door, the ceramicist who moved from Melbourne, the vintage store everyone drives forty minutes for.
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 16,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 600, marginTop: 16,
        }}>
          Australian Atlas does. {stats.listings > 0 ? stats.listings.toLocaleString() : '6,800'}+ verified independent listings, across nine curated directories, covering {stats.regions || 46} regions. Every listing verified. No chains. No aggregator padding.
        </p>
      </section>

      {/* Live Stats */}
      <section style={{ padding: '0 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
          padding: '28px 32px', borderRadius: 12,
          background: 'var(--color-cream, #faf7f2)',
          border: '1px solid var(--color-border)',
        }}>
          {[
            { n: stats.listings > 0 ? stats.listings.toLocaleString() : '6,881', label: 'Verified listings' },
            { n: '9', label: 'Curated atlases' },
            { n: String(stats.regions || 46), label: 'Mapped regions' },
            { n: stats.claimed > 0 ? stats.claimed.toLocaleString() : '—', label: 'Operator-claimed' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28,
                color: 'var(--color-ink)', margin: 0, lineHeight: 1.1,
              }}>{s.n}</p>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11,
                color: 'var(--color-muted)', margin: '6px 0 0', lineHeight: 1.2,
              }}>{s.label}</p>
            </div>
          ))}
        </div>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11,
          color: 'var(--color-muted)', opacity: 0.6, marginTop: 8, textAlign: 'center',
        }}>
          Numbers pulled live from the Australian Atlas database
        </p>
      </section>

      {/* What councils get */}
      <section style={{ padding: '3rem 1.5rem 4rem', maxWidth: '720px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          What you get
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.75rem',
          color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 32,
        }}>
          Regional intelligence, not just a listing service
        </h2>

        <div style={{ display: 'grid', gap: 24 }}>
          {[
            {
              title: 'Regional data access',
              desc: 'Every verified independent listing in your region, across all nine atlases. Filterable, exportable, always current. See what visitors are actually searching for in your area.',
            },
            {
              title: 'Content co-creation',
              desc: 'Commission editorial trails, regional profiles, and producer features through the Atlas Journal. Content that reads like independent journalism, not destination marketing.',
            },
            {
              title: 'Coverage gap analysis',
              desc: 'See where your region is well-mapped and where listings are thin. Identify which verticals have room to grow and which independent businesses are missing from the network.',
            },
            {
              title: 'Search and trail demand data',
              desc: 'Understand what visitors are actually looking for in your region — search queries, trail generation prompts, and zero-result searches that reveal unmet demand.',
            },
            {
              title: 'Network reach across nine atlases',
              desc: 'Your region appears on nine separate, SEO-optimised vertical sites plus the master portal. Cross-vertical trail generation drives multi-day visitation by combining venues across categories.',
            },
            {
              title: 'Listing quality management',
              desc: 'Flag outdated information, suggest new listings, and request Journal coverage for venues in your region. Listings you champion get prioritised for verification.',
            },
          ].map(item => (
            <div key={item.title} style={{
              padding: '20px 24px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: '#fff',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
                color: 'var(--color-ink)', marginBottom: 6,
              }}>{item.title}</h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
                color: 'var(--color-muted)', lineHeight: 1.55, margin: 0,
              }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The nine atlases */}
      <section style={{ padding: '3rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          The Network
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.75rem',
          color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 24,
        }}>
          Nine curated directories, one verified data layer
        </h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {VERTICALS.map(v => (
            <div key={v.key} style={{
              padding: '14px 18px', borderRadius: 8,
              border: '1px solid var(--color-border)', background: '#fff',
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
                  color: 'var(--color-ink)', margin: 0,
                }}>{v.name}</p>
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
                  color: 'var(--color-muted)', margin: '2px 0 0',
                }}>{v.what}</p>
              </div>
              {stats.verticalCounts[v.key] > 0 && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                  color: 'var(--color-muted)', whiteSpace: 'nowrap',
                }}>
                  {stats.verticalCounts[v.key].toLocaleString()}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section style={{ padding: '4rem 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          Partnership Plans
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.75rem',
          color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 8,
        }}>
          Annual partnerships, not subscriptions
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15,
          color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: 32, maxWidth: 560,
        }}>
          Partnerships start with a conversation about your region and what you need. Plans run annually and are scoped to the number of regions and the level of data access and editorial support you need.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { name: 'Explorer', price: '$249/yr', desc: 'Regional data access, listing counts by vertical, basic coverage report, embeddable map widget.' },
            { name: 'Partner', price: '$3,500/yr', desc: 'Full analytics dashboard, search demand data, content co-creation, coverage gap analysis, editorial trail commissioning.' },
            { name: 'Enterprise', price: 'From $8,500/yr', desc: 'Multiple regions, API access, white-label reports, custom exports, dedicated account management.' },
          ].map(t => (
            <div key={t.name} style={{
              padding: '24px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: '#fff',
            }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
                color: 'var(--color-ink)', marginBottom: 4,
              }}>{t.name}</p>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
                color: 'var(--color-ink)', marginBottom: 12,
              }}>{t.price}</p>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13,
                color: 'var(--color-muted)', lineHeight: 1.5, margin: 0,
              }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '3rem 1.5rem 5rem', maxWidth: '720px', margin: '0 auto',
        textAlign: 'center',
      }}>
        <div style={{
          padding: '40px 32px', borderRadius: 12,
          background: 'var(--color-ink)', color: '#fff',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.5rem',
            color: '#fff', marginBottom: 8,
          }}>
            Start with a conversation
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
            color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 24, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
          }}>
            Every council partnership begins with understanding what already exists in your region on the network. We can show you your listing data before you commit to anything.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a
              href="mailto:councils@australianatlas.com.au"
              style={{
                display: 'inline-block', padding: '12px 28px', borderRadius: 6,
                background: 'var(--color-accent)', color: '#fff',
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
                textDecoration: 'none',
              }}
            >
              councils@australianatlas.com.au
            </a>
            <Link
              href="/council/login"
              style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
                color: 'rgba(255,255,255,0.6)', textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              Existing partner login
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
