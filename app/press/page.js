import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Press Kit — Australian Atlas',
  description: 'Live network stats, vertical overviews, and media contact information for the Australian Atlas network — nine curated directories mapping independent Australia.',
}

const verticals = [
  { key: 'sba', name: 'Small Batch Atlas', desc: 'Craft breweries, wineries, distilleries, cideries and cellar doors' },
  { key: 'collection', name: 'Collection Atlas', desc: 'Museums, galleries, heritage sites and cultural centres' },
  { key: 'craft', name: 'Craft Atlas', desc: 'Makers, artists and studios across every discipline' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas', desc: 'Specialty coffee roasters and independent cafes' },
  { key: 'rest', name: 'Rest Atlas', desc: 'Boutique hotels, farm stays, glamping and cottages' },
  { key: 'field', name: 'Field Atlas', desc: 'Swimming holes, waterfalls, lookouts and natural places' },
  { key: 'corner', name: 'Corner Atlas', desc: 'Bookshops, record stores, homewares and indie retail' },
  { key: 'found', name: 'Found Atlas', desc: 'Vintage stores, op shops, antique dealers and markets' },
  { key: 'table', name: 'Table Atlas', desc: 'Farm gates, bakeries, food producers and providores' },
]

async function getPressStats() {
  try {
    const sb = getSupabaseAdmin()

    const [
      { count: totalListings },
      { count: regionCount },
      { count: claimedCount },
    ] = await Promise.all([
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('regions').select('*', { count: 'exact', head: true }),
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_claimed', true),
    ])

    // Per-vertical counts
    const verticalCounts = {}
    for (const v of verticals) {
      const { count: c } = await sb
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('vertical', v.key)
        .eq('status', 'active')
      verticalCounts[v.key] = c || 0
    }

    return {
      totalListings: totalListings || 0,
      regionCount: regionCount || 0,
      claimedCount: claimedCount || 0,
      verticalCounts,
    }
  } catch {
    return { totalListings: 0, regionCount: 0, claimedCount: 0, verticalCounts: {} }
  }
}

export default async function PressPage() {
  const stats = await getPressStats()
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Header */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem 3rem', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          Media
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 48px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 16,
        }}>
          Press Kit
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 auto',
        }}>
          Last updated {today}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
          color: 'var(--color-muted)', lineHeight: 1.6, marginTop: 8,
          opacity: 0.7,
        }}>
          Stats on this page are live from the Australian Atlas database.
        </p>
      </section>

      {/* Network Overview */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
          }}>
            Network Overview
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 24,
          }}>
            What Australian Atlas is
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              Australian Atlas is a network of nine curated directories mapping independent
              Australia &mdash; the breweries, galleries, bookshops, vintage stores, farm gates,
              boutique stays, specialty roasters, makers, and natural places that make regions
              worth visiting.
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              Every listing is verified. No chains. No aggregator padding. The network exists
              to surface the kind of places that word-of-mouth built.
            </p>
          </div>
        </div>
      </section>

      {/* Key Facts */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          Key Facts
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
          color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 28,
        }}>
          At a glance
        </h2>

        <dl style={{ margin: 0, padding: 0 }}>
          {[
            { term: 'Founded', value: '2024' },
            { term: 'Coverage', value: 'All states and territories across Australia' },
            { term: 'Listings', value: `${stats.totalListings.toLocaleString()} verified independent listings` },
            { term: 'Regions', value: `${stats.regionCount} mapped regions` },
            {
              term: 'Verticals',
              value: `9 — ${verticals.map(v => v.name).join(', ')}`,
            },
            { term: 'Claimed listings', value: `${stats.claimedCount.toLocaleString()} operator-managed` },
            { term: 'Editorial standard', value: 'Independently verified, no paid placement in editorial content' },
            { term: 'Trail generation', value: 'AI-powered itinerary builder across all nine verticals' },
          ].map((item, i, arr) => (
            <div key={item.term} style={{
              display: 'flex', gap: 16, padding: '16px 0',
              borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
              flexWrap: 'wrap',
            }}>
              <dt style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                color: 'var(--color-ink)', minWidth: 140, flexShrink: 0,
              }}>
                {item.term}
              </dt>
              <dd style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.6, margin: 0, flex: 1,
              }}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The Nine Atlases */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        padding: '3.5rem 1.5rem',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--color-sage)', marginBottom: 12,
            }}>
              The Network
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
              color: 'var(--color-ink)', lineHeight: 1.25,
            }}>
              The nine atlases
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}>
            {verticals.map(v => (
              <div key={v.key} style={{
                background: 'white', borderRadius: 10, padding: '22px 20px',
                border: '1px solid var(--color-border)',
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                  color: 'var(--color-ink)', margin: '0 0 6px',
                }}>
                  {v.name}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                  color: 'var(--color-muted)', lineHeight: 1.55, margin: '0 0 12px',
                }}>
                  {v.desc}
                </p>
                {stats.verticalCounts[v.key] > 0 && (
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: 'var(--color-ink)', margin: 0, opacity: 0.5,
                  }}>
                    {stats.verticalCounts[v.key].toLocaleString()} listings
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founding Story — placeholder */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          Founding Story
        </p>
        <div style={{
          padding: '28px 24px', borderRadius: 12,
          border: '2px dashed var(--color-sage)',
          background: 'var(--color-cream)',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            color: 'var(--color-sage)', margin: '0 0 8px',
          }}>
            Content needed
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.65, margin: 0,
          }}>
            Founding story copy to be added manually. This section should be one honest
            paragraph about why this exists and what it&apos;s trying to do.
          </p>
        </div>
      </section>

      {/* Media Contact */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
          }}>
            Contact
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 20,
          }}>
            Media contact
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 0 20px',
          }}>
            For media enquiries, partnership discussions, or interview requests:
          </p>
          <a
            href="mailto:matt@australianatlas.com.au"
            style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
              color: 'var(--color-sage)', textDecoration: 'underline',
              textUnderlineOffset: 4,
            }}
          >
            matt@australianatlas.com.au
          </a>
        </div>
      </section>

      {/* Assets — placeholder */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '3.5rem 1.5rem 5rem' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          Assets
        </p>
        <div style={{
          padding: '24px', borderRadius: 12,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
          }}>
            Logo files, screenshots, and visual assets will be available for download here shortly.
          </p>
        </div>
      </section>
    </div>
  )
}
