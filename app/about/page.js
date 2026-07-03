import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import ScrollReveal from '@/components/ScrollReveal'
import { VERTICAL_CARD_BG as CARD_BG } from '@/lib/verticalUrl'
import { getNetworkStats } from '@/lib/networkStats'

export const revalidate = 86400

export const metadata = {
  title: 'About | Australian Atlas',
  description: 'Australian Atlas is an independently operated guide to independent Australia — ten curated atlases mapping makers, producers, cultural spaces, and natural places across the country.',
  openGraph: {
    title: 'About | Australian Atlas',
    description: 'Australian Atlas is an independently operated guide to independent Australia — ten curated atlases mapping makers, producers, cultural spaces, and natural places across the country.',
    url: 'https://australianatlas.com.au/about',
  },
}

const aboutJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Australian Atlas',
  url: 'https://australianatlas.com.au',
  logo: 'https://australianatlas.com.au/favicon-512.png',
  description: 'An independently operated guide to independent Australia. Ten curated atlases mapping makers, producers, cultural spaces, and natural places across the country.',
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
  { key: 'sba', name: 'Small Batch', url: 'https://smallbatchatlas.com.au' },
  { key: 'craft', name: 'Craft', url: 'https://craftatlas.com.au' },
  { key: 'collection', name: 'Culture', url: 'https://collectionatlas.com.au' },
  { key: 'fine_grounds', name: 'Fine Grounds', url: 'https://finegroundsatlas.com.au' },
  { key: 'rest', name: 'Rest', url: 'https://restatlas.com.au' },
  { key: 'field', name: 'Field', url: 'https://fieldatlas.com.au' },
  { key: 'corner', name: 'Corner', url: 'https://corneratlas.com.au' },
  { key: 'found', name: 'Found', url: 'https://foundatlas.com.au' },
  { key: 'table', name: 'Table', url: 'https://tableatlas.com.au' },
  { key: 'way', name: 'Way', url: 'https://wayatlas.com.au' },
]

const BELIEF_KEYS = ['belief1', 'belief2', 'belief3', 'belief4']

const VERTICAL_CARD_BG = {
  'Small Batch': CARD_BG.sba, 'Craft': CARD_BG.craft, 'Culture': CARD_BG.collection,
  'Fine Grounds': CARD_BG.fine_grounds, 'Rest': CARD_BG.rest, 'Field': CARD_BG.field,
  'Corner': CARD_BG.corner, 'Found': CARD_BG.found, 'Table': CARD_BG.table,
  'Way': CARD_BG.way,
}

export default async function AboutPage() {
  const stats = await getNetworkStats()
  const t = await getTranslations('explore')

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
        <p className="section-dateline" style={{ marginBottom: 24 }}>
          {t('aboutKicker')}
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
          {t.rich('aboutHeroTitle', {
            br: () => <br />,
            em: (chunks) => <em style={{ fontStyle: 'italic' }}>{chunks}</em>,
          })}
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
          {t('aboutHeroSubtitle')}
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
            {t('aboutStory1')}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.75, margin: 0,
          }}>
            {stats.listings > 0
              ? t('aboutStory2WithListings', { regions: stats.regions, listings: stats.listings.toLocaleString() })
              : t('aboutStory2', { regions: stats.regions })}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.75, margin: 0,
          }}>
            {t('aboutStory3')}
          </p>
        </div>
      </ScrollReveal>

      {/* ── What We Believe — alternating full-width blocks ── */}
      {BELIEF_KEYS.map((bkey, i) => (
        <ScrollReveal
          key={bkey}
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
              {t(`${bkey}Title`)}
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.75, margin: 0,
              maxWidth: 580,
            }}>
              {t(`${bkey}Body`)}
            </p>
          </div>
        </ScrollReveal>
      ))}

      {/* ── The Atlases ── */}
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
              {t('aboutNetworkKicker')}
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 40px)',
              fontWeight: 400, color: 'var(--color-ink)', marginBottom: 12,
              lineHeight: 1.15,
            }}>
              {t('aboutNetworkHeading')}
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto',
              maxWidth: 520,
            }}>
              {t('aboutNetworkSubtitle')}
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
                      {t(`atlas_${atlas.key}_name`)}
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                      color: 'rgba(250,248,244,0.6)', lineHeight: 1.55, margin: 0,
                    }}>
                      {t(`atlas_${atlas.key}_desc`)}
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
              {t('aboutWhoKicker')}
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 40px)',
              fontWeight: 400, color: 'var(--color-ink)',
              lineHeight: 1.15,
            }}>
              {t('aboutWhoHeading')}
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
          }}>
            {[
              { title: t('audTravellersTitle'), body: t('audTravellersBody'), link: '/explore', cta: t('audTravellersCta') },
              { title: t('audOperatorsTitle'), body: t('audOperatorsBody'), link: '/operators', cta: t('audOperatorsCta') },
              { title: t('audCouncilsTitle'), body: t('audCouncilsBody'), link: '/for-councils', cta: t('audCouncilsCta') },
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
            {t('aboutCommunityTitle')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto 28px',
            maxWidth: 480,
          }}>
            {t('aboutCommunityDesc')}
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
            {t('suggestPlace')}
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
          {t.rich('aboutPartOf', {
            link: (chunks) => (
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
                {chunks}
              </a>
            ),
          })}
        </p>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'var(--color-muted)', margin: 0,
          }}>
            {t('aboutGeneralEnquiries')}{' '}
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
            {t('aboutCouncilsEnquiries')}{' '}
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
