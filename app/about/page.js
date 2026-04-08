import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const revalidate = 86400

export const metadata = {
  title: 'About | Australian Atlas',
  description: 'Australian Atlas is an independently operated guide to independent Australia — 9 curated atlases mapping makers, producers, and cultural spaces across the country.',
}

async function getStats() {
  try {
    const sb = getSupabaseAdmin()
    const [{ count: listings }, { count: regions }] = await Promise.all([
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('regions').select('*', { count: 'exact', head: true }),
    ])
    return { listings: listings || 0, regions: regions || 0 }
  } catch {
    return { listings: 6881, regions: 46 }
  }
}

export default async function AboutPage() {
  const stats = await getStats()

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '5rem 1.5rem 3rem' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          About
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 24,
        }}>
          An independent guide to<br />independent Australia
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
          }}>
            Australian Atlas maps the places that make regional Australia worth visiting:
            the small-batch distillery, the ceramics studio, the gallery in a converted woolshed,
            the swimming hole the locals know about, the vintage shop worth the detour.
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
          }}>
            Nine curated atlases cover every category of independent place across {stats.regions} regions.
            {stats.listings > 0 ? ` ${stats.listings.toLocaleString()} listings and growing.` : ''} Each one
            verified, categorised, and mapped.
          </p>
        </div>
      </section>

      {/* The nine atlases */}
      <section style={{
        maxWidth: 680, margin: '0 auto', padding: '0 1.5rem 3rem',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400,
          color: 'var(--color-ink)', marginBottom: 20,
        }}>
          Nine atlases, one network
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { name: 'Small Batch Atlas', desc: 'Wineries, breweries, distilleries', url: 'https://smallbatchatlas.com.au' },
            { name: 'Culture Atlas', desc: 'Galleries, museums, heritage', url: 'https://collectionatlas.com.au' },
            { name: 'Craft Atlas', desc: 'Makers, artists, studios', url: 'https://craftatlas.com.au' },
            { name: 'Fine Grounds Atlas', desc: 'Specialty coffee, indie cafes', url: 'https://finegroundsatlas.com.au' },
            { name: 'Rest Atlas', desc: 'Boutique stays, glamping', url: 'https://restatlas.com.au' },
            { name: 'Field Atlas', desc: 'Natural places, walks, lookouts', url: 'https://fieldatlas.com.au' },
            { name: 'Corner Atlas', desc: 'Bookshops, records, retail', url: 'https://corneratlas.com.au' },
            { name: 'Found Atlas', desc: 'Vintage, op shops, antiques', url: 'https://foundatlas.com.au' },
            { name: 'Table Atlas', desc: 'Farm gates, bakeries, food', url: 'https://tableatlas.com.au' },
          ].map(atlas => (
            <a
              key={atlas.name}
              href={atlas.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', padding: '14px 16px', borderRadius: 8,
                border: '1px solid var(--color-border)', textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
            >
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                color: 'var(--color-ink)', margin: '0 0 2px',
              }}>
                {atlas.name}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
                color: 'var(--color-muted)', margin: 0,
              }}>
                {atlas.desc}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400,
            color: 'var(--color-ink)', marginBottom: 20,
          }}>
            How it&apos;s built
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              Every listing in the network is sourced from verified data, location-checked,
              and categorised. We run automated audits across the full database to verify
              URLs, phone numbers, and business status. Venues that can&apos;t be verified
              are flagged and excluded from editorial content.
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              There is no paid placement. Listings appear because they exist and are verified,
              not because someone paid to be included. Venue operators can claim their listing
              for free to update details, or subscribe for enhanced features.
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              Discovery trails are generated from verified venue data using geographic
              bounding boxes and user preferences. The itinerary engine pulls from real
              listings only &mdash; it cannot invent or hallucinate venues.
            </p>
          </div>
        </div>
      </section>

      {/* Who we are */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400,
          color: 'var(--color-ink)', marginBottom: 20,
        }}>
          Who we are
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
          }}>
            Australian Atlas is independently operated and Australian-owned.
            It&apos;s built by a small team that cares about documenting
            the independent, maker-driven, culturally rich side of this country
            &mdash; the layer that mass tourism platforms tend to miss.
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
          }}>
            Australian Atlas is part of{' '}
            <a
              href="https://australianheritage.au"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              Australian Heritage
            </a>
            , an editorial network focused on Australian culture, place, and identity.
          </p>
        </div>

        <div style={{
          marginTop: 32, padding: '20px 24px', borderRadius: 12,
          background: 'var(--color-cream)', border: '1px solid var(--color-border)',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 400,
            color: 'var(--color-ink)', margin: '0 0 6px',
          }}>
            Get in touch
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'var(--color-muted)', margin: '0 0 4px',
          }}>
            General enquiries:{' '}
            <a href="mailto:hello@australianatlas.com.au" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              hello@australianatlas.com.au
            </a>
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'var(--color-muted)', margin: 0,
          }}>
            Councils & tourism bodies:{' '}
            <a href="mailto:councils@australianatlas.com.au" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              councils@australianatlas.com.au
            </a>
          </p>
        </div>
      </section>
    </div>
  )
}
