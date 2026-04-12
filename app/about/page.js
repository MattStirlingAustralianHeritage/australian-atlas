import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const revalidate = 86400

export const metadata = {
  title: 'About | Australian Atlas',
  description: 'Australian Atlas is an independently operated guide to independent Australia — nine curated atlases mapping makers, producers, cultural spaces, and natural places across the country.',
  openGraph: {
    title: 'About | Australian Atlas',
    description: 'Australian Atlas is an independently operated guide to independent Australia — nine curated atlases mapping makers, producers, cultural spaces, and natural places across the country.',
    url: 'https://australianatlas.com.au/about',
  },
}

const aboutJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Australian Atlas',
  url: 'https://australianatlas.com.au',
  logo: 'https://australianatlas.com.au/favicon-512.png',
  description: 'An independently operated guide to independent Australia. Nine curated atlases mapping makers, producers, cultural spaces, and natural places across the country.',
  foundingLocation: {
    '@type': 'Country',
    name: 'Australia',
  },
  parentOrganization: {
    '@type': 'Organization',
    name: 'Australian Heritage',
    url: 'https://australianheritage.au',
  },
}

const ATLASES = [
  { name: 'Small Batch', desc: 'Craft drink. The distillers, brewers, winemakers, and cidermakers doing it independently.', url: 'https://smallbatchatlas.com.au' },
  { name: 'Craft', desc: 'Makers. Ceramicists, woodworkers, textile artists, glassblowers, and studio potters.', url: 'https://craftatlas.com.au' },
  { name: 'Culture', desc: 'Museums, galleries, heritage spaces, and artist-run initiatives worth the visit.', url: 'https://collectionatlas.com.au' },
  { name: 'Fine Grounds', desc: 'Specialty coffee. Single-origin roasters, independent cafes, and the places that take it seriously.', url: 'https://finegroundsatlas.com.au' },
  { name: 'Rest', desc: 'Boutique stays. The cabin in the ranges, the guesthouse on the coast, the converted shed.', url: 'https://restatlas.com.au' },
  { name: 'Field', desc: 'Natural places. Swimming holes, walking trails, lookouts, and the landscapes between towns.', url: 'https://fieldatlas.com.au' },
  { name: 'Corner', desc: 'Independent shops. Bookshops, record stores, design studios, and retailers who stock with intent.', url: 'https://corneratlas.com.au' },
  { name: 'Found', desc: 'Vintage and secondhand. Op shops, antique dealers, salvage yards, and the thrill of the find.', url: 'https://foundatlas.com.au' },
  { name: 'Table', desc: 'Food producers. Farm gates, bakeries, providores, and the people growing and making what you eat.', url: 'https://tableatlas.com.au' },
]

const BELIEFS = [
  {
    title: 'Independence is the filter',
    body: 'No chains. No franchises. No paid placements. Every listing in the network exists because someone built something real, not because they bought visibility. If a place is here, it is because it is independently run and worth knowing about.',
  },
  {
    title: 'Specificity matters',
    body: 'Every listing is verified, geocoded, and categorised. We check URLs, phone numbers, and business status. Venues that cannot be verified are excluded. We would rather have a smaller, accurate atlas than a large, unreliable one.',
  },
  {
    title: 'The country is the subject',
    body: 'Australia has an extraordinary independent layer: the makers, the growers, the people running galleries in converted woolsheds and roasting coffee in country towns. Most platforms miss it. We exist to map it.',
  },
  {
    title: 'Small team, long view',
    body: 'Australian Atlas is built by a small team in Australia. We are not a venture-backed startup chasing growth metrics. We are building a reference work, and we intend to be here for a long time.',
  },
]

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />

      {/* ── Hero ── */}
      <section style={{
        maxWidth: 740,
        margin: '0 auto',
        padding: '6rem 1.5rem 4rem',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 5.5vw, 56px)',
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'var(--color-ink)',
          lineHeight: 1.15,
          margin: '0 0 24px',
          letterSpacing: '-0.01em',
        }}>
          Australian Atlas
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(16px, 2vw, 19px)',
          fontWeight: 300,
          color: 'var(--color-muted)',
          lineHeight: 1.6,
          margin: '0 auto',
          maxWidth: 560,
        }}>
          An independent guide to independent Australia &mdash; mapping the small batch producers,
          the family-run stays, the bookshops, the galleries you stumble upon, and the places
          that make this country worth exploring slowly.
        </p>
      </section>

      {/* ── Divider ── */}
      <div style={{
        maxWidth: 60,
        margin: '0 auto',
        borderTop: '1px solid var(--color-border)',
      }} />

      {/* ── The Story ── */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3.5rem 1.5rem 3rem',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.75, margin: 0,
          }}>
            There is another Australia underneath the one the big platforms show you.
            It is the ceramics studio in a regional town, the distillery in a converted dairy,
            the swimming hole the locals know about, the vintage shop worth the detour.
            These places rarely appear on mainstream travel sites. They are too small,
            too independent, too particular.
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.75, margin: 0,
          }}>
            Australian Atlas exists to map that layer. Nine curated atlases cover every dimension
            of independent culture across {stats.regions} regions
            {stats.listings > 0 ? ` and ${stats.listings.toLocaleString()} verified listings` : ''}.
            Each place is checked, categorised, and maintained &mdash; a reference work,
            not a scrape.
          </p>
        </div>
      </section>

      {/* ── What We Believe ── */}
      <section style={{
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 740,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 28, textAlign: 'center',
          }}>
            What we believe
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 32,
          }}>
            {BELIEFS.map(belief => (
              <div key={belief.title}>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: 'var(--color-ink)',
                  margin: '0 0 8px',
                }}>
                  {belief.title}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                  color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
                }}>
                  {belief.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Nine Atlases ── */}
      <section style={{
        maxWidth: 740,
        margin: '0 auto',
        padding: '3.5rem 1.5rem',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 8, textAlign: 'center',
        }}>
          The Network
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 30px)',
          fontWeight: 400, color: 'var(--color-ink)', marginBottom: 12,
          textAlign: 'center',
        }}>
          Nine atlases, one Australia
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto 32px',
          maxWidth: 520, textAlign: 'center',
        }}>
          Each atlas covers a distinct category of independent place.
          Together, they form the most comprehensive guide to independent Australia.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {ATLASES.map(atlas => (
            <a
              key={atlas.name}
              href={atlas.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                padding: '18px 20px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                textDecoration: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                background: 'white',
              }}
            >
              <p style={{
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 400,
                fontStyle: 'italic',
                color: 'var(--color-ink)', margin: '0 0 6px',
              }}>
                {atlas.name}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.55, margin: 0,
              }}>
                {atlas.desc}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{
        maxWidth: 60,
        margin: '0 auto',
        borderTop: '1px solid var(--color-border)',
      }} />

      {/* ── For Everyone ── */}
      <section style={{
        maxWidth: 740,
        margin: '0 auto',
        padding: '3.5rem 1.5rem',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 8, textAlign: 'center',
        }}>
          Built for
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 30px)',
          fontWeight: 400, color: 'var(--color-ink)', marginBottom: 36,
          textAlign: 'center',
        }}>
          Three audiences, one platform
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 20,
        }}>
          {/* Travellers */}
          <div style={{
            padding: '28px 24px',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'white',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
              fontStyle: 'italic', color: 'var(--color-ink)', margin: '0 0 10px',
            }}>
              Travellers
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.65, margin: '0 0 16px',
            }}>
              Discover independent places across the country. Build trails, save favourites,
              and plan trips around the things that actually make a region interesting.
            </p>
            <Link href="/explore" style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: 'var(--color-sage)', textDecoration: 'none',
              borderBottom: '1px solid var(--color-sage)',
              paddingBottom: 1,
            }}>
              Start exploring
            </Link>
          </div>

          {/* Operators */}
          <div style={{
            padding: '28px 24px',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'white',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
              fontStyle: 'italic', color: 'var(--color-ink)', margin: '0 0 10px',
            }}>
              Operators
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.65, margin: '0 0 16px',
            }}>
              If you run an independent venue, your listing may already be here.
              Claim it for free to update your details, or subscribe for enhanced features.
            </p>
            <Link href="/operators" style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: 'var(--color-sage)', textDecoration: 'none',
              borderBottom: '1px solid var(--color-sage)',
              paddingBottom: 1,
            }}>
              For operators
            </Link>
          </div>

          {/* Councils */}
          <div style={{
            padding: '28px 24px',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'white',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
              fontStyle: 'italic', color: 'var(--color-ink)', margin: '0 0 10px',
            }}>
              Councils
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.65, margin: '0 0 16px',
            }}>
              Tourism bodies and regional councils get access to verified data,
              regional dashboards, and embeddable content for their own platforms.
            </p>
            <Link href="/for-councils" style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: 'var(--color-sage)', textDecoration: 'none',
              borderBottom: '1px solid var(--color-sage)',
              paddingBottom: 1,
            }}>
              For councils
            </Link>
          </div>
        </div>
      </section>

      {/* ── Community ── */}
      <section style={{
        background: 'var(--color-cream)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 28px)',
            fontWeight: 400, fontStyle: 'italic',
            color: 'var(--color-ink)', marginBottom: 14,
          }}>
            Know a place we should list?
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto 24px',
            maxWidth: 480,
          }}>
            Australian Atlas is community-driven. Anyone can suggest a place, report an issue,
            or help us build a more complete picture of independent Australia.
          </p>
          <Link
            href="/suggest"
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 500,
              color: 'white',
              background: 'var(--color-sage)',
              padding: '12px 28px',
              borderRadius: 8,
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
          >
            Suggest a place
          </Link>
        </div>
      </section>

      {/* ── Contact ── */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3.5rem 1.5rem 4.5rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 0 6px',
        }}>
          Australian Atlas is part of{' '}
          <a
            href="https://australianheritage.au"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--color-sage)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Australian Heritage
          </a>
          , an editorial network focused on Australian culture, place, and identity.
        </p>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'var(--color-muted)', margin: 0,
          }}>
            General enquiries:{' '}
            <a href="mailto:hello@australianatlas.com.au" style={{
              color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
              hello@australianatlas.com.au
            </a>
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'var(--color-muted)', margin: 0,
          }}>
            Councils & tourism bodies:{' '}
            <a href="mailto:councils@australianatlas.com.au" style={{
              color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
              councils@australianatlas.com.au
            </a>
          </p>
        </div>
      </section>
    </div>
  )
}
