import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ScrollReveal from '@/components/ScrollReveal'

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
    title: 'One person, long view',
    body: 'Australian Atlas is built and maintained by one person in Australia. It is not a venture-backed startup chasing growth metrics. It is a reference work, built with care, and intended to last.',
  },
]

const VERTICAL_CARD_BG = {
  'Small Batch': '#3D2B1F', 'Craft': '#4A3728', 'Culture': '#2D3436',
  'Fine Grounds': '#2C1810', 'Rest': '#1B2631', 'Field': '#1E3A2F',
  'Corner': '#3B2F2F', 'Found': '#2F2B26', 'Table': '#3A2E1F',
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />

      {/* ── Hero ── */}
      <section style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '8rem 1.5rem 5rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--color-muted)', marginBottom: 24,
        }}>
          About
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(40px, 7vw, 72px)',
          fontWeight: 400,
          color: 'var(--color-ink)',
          lineHeight: 1.05,
          margin: '0 0 28px',
          letterSpacing: '-0.02em',
        }}>
          An independent guide to<br /><em style={{ fontStyle: 'italic' }}>independent</em> Australia
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(16px, 2vw, 18px)',
          fontWeight: 300,
          color: 'var(--color-muted)',
          lineHeight: 1.7,
          margin: '0 auto',
          maxWidth: 560,
        }}>
          Mapping the small batch producers, the family-run stays, the bookshops,
          the galleries you stumble upon, and the places that make this country
          worth exploring slowly.
        </p>
      </section>

      {/* ── The Story ── */}
      <ScrollReveal as="section" style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '0 1.5rem 5rem',
      }}>
        <div style={{
          width: 32, height: 1,
          background: 'var(--color-ink)', opacity: 0.15,
          margin: '0 auto 3rem',
        }} />

        <div className="reveal" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.75, margin: 0,
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
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.75, margin: 0,
          }}>
            I started this because I kept finding places that deserved more visibility than an
            Instagram post or a Google pin. A distiller doing something genuinely interesting
            in a shed outside Castlemaine. A bookshop in a town of 400 people. These are the
            places that make a region worth the drive, and nobody was mapping them properly.
          </p>
        </div>
      </ScrollReveal>

      {/* ── What We Believe — alternating full-width blocks ── */}
      {BELIEFS.map((belief, i) => (
        <ScrollReveal
          key={belief.title}
          as="section"
          style={{
            background: i % 2 === 0 ? 'var(--color-cream)' : 'var(--color-bg)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className="reveal" style={{
            maxWidth: 680,
            margin: '0 auto',
            padding: '4.5rem 1.5rem',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'var(--color-ink)',
              lineHeight: 1.15,
              margin: '0 0 16px',
            }}>
              {belief.title}
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.75, margin: 0,
              maxWidth: 580,
            }}>
              {belief.body}
            </p>
          </div>
        </ScrollReveal>
      ))}

      {/* ── Nine Atlases ── */}
      <ScrollReveal as="section" className="section-gap" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '0 1.5rem',
        }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginBottom: 12,
            }}>
              The Network
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 40px)',
              fontWeight: 400, color: 'var(--color-ink)', marginBottom: 12,
              lineHeight: 1.15,
            }}>
              Nine atlases, one Australia
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto',
              maxWidth: 520,
            }}>
              Each atlas covers a distinct category of independent place.
              Together, they form the most comprehensive guide to independent Australia.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}>
            {ATLASES.map((atlas, ai) => {
              const bg = VERTICAL_CARD_BG[atlas.name] || '#0f0e0c'
              return (
                <a
                  key={atlas.name}
                  href={atlas.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reveal listing-card"
                  data-reveal-index={ai}
                  style={{
                    display: 'block',
                    padding: '24px 22px',
                    borderRadius: 10,
                    background: bg,
                    textDecoration: 'none',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: 'radial-gradient(circle, #FAF8F4 1px, transparent 1px)',
                    backgroundSize: '16px 16px', opacity: 0.05, pointerEvents: 'none',
                  }} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <p style={{
                      fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                      color: '#FAF8F4', margin: '0 0 8px', lineHeight: 1.3,
                    }}>
                      {atlas.name}
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                      color: 'rgba(250,248,244,0.6)', lineHeight: 1.55, margin: 0,
                    }}>
                      {atlas.desc}
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </ScrollReveal>

      {/* ── For Everyone ── */}
      <ScrollReveal as="section" className="section-gap" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '0 1.5rem',
        }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginBottom: 12,
            }}>
              Who it&apos;s for
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 40px)',
              fontWeight: 400, color: 'var(--color-ink)',
              lineHeight: 1.15,
            }}>
              Different people, same network
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
          }}>
            {[
              { title: 'Travellers', body: 'Discover independent places across the country. Build trails, save favourites, and plan trips around the things that actually make a region interesting.', link: '/explore', cta: 'Start exploring' },
              { title: 'Operators', body: 'If you run an independent venue, your listing may already be here. Claim it for free to update your details, or subscribe for enhanced features.', link: '/operators', cta: 'For operators' },
              { title: 'Councils', body: 'Tourism bodies and regional councils get access to verified data, regional dashboards, and embeddable content for their own platforms.', link: '/for-councils', cta: 'For councils' },
            ].map((item, idx) => (
              <div
                key={item.title}
                className="reveal"
                data-reveal-index={idx}
                style={{
                  padding: '32px 28px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: 'white',
                }}
              >
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
                  fontStyle: 'italic', color: 'var(--color-ink)', margin: '0 0 12px',
                }}>
                  {item.title}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                  color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 0 20px',
                }}>
                  {item.body}
                </p>
                <Link href={item.link} style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'var(--color-ink)', textDecoration: 'none',
                  borderBottom: '1px solid var(--color-border)',
                  paddingBottom: 2,
                }}>
                  {item.cta} &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* ── Community ── */}
      <section style={{
        background: 'var(--color-cream)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '5rem 1.5rem',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 400, fontStyle: 'italic',
            color: 'var(--color-ink)', marginBottom: 16, lineHeight: 1.15,
          }}>
            Know a place we should list?
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto 28px',
            maxWidth: 480,
          }}>
            The network gets better when people contribute. If you know an independent place
            that should be listed &mdash; a maker, a producer, a shop, a swimming hole &mdash; let me know.
          </p>
          <Link
            href="/suggest"
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 500,
              color: 'white',
              background: 'var(--color-ink)',
              padding: '14px 32px',
              borderRadius: 100,
              textDecoration: 'none',
              transition: 'opacity 0.15s',
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
        padding: '4rem 1.5rem 5rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 0 8px',
        }}>
          Australian Atlas is part of{' '}
          <a
            href="https://australianheritage.au"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--color-ink)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              textDecorationColor: 'var(--color-border)',
            }}
          >
            Australian Heritage
          </a>
          , an editorial network focused on Australian culture, place, and identity.
        </p>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'var(--color-muted)', margin: 0,
          }}>
            General enquiries:{' '}
            <a href="mailto:hello@australianatlas.com.au" style={{
              color: 'var(--color-ink)', textDecoration: 'underline',
              textUnderlineOffset: 3, textDecorationColor: 'var(--color-border)',
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
              color: 'var(--color-ink)', textDecoration: 'underline',
              textUnderlineOffset: 3, textDecorationColor: 'var(--color-border)',
            }}>
              councils@australianatlas.com.au
            </a>
          </p>
        </div>
      </section>
    </div>
  )
}
