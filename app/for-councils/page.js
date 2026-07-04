import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getAtlasCount } from '@/lib/networkStats'

export const revalidate = 86400

// Single source of truth for the live vertical count (currently 10). Derived
// from getPublicVerticals() via getAtlasCount() so every mention on this page
// stays in lockstep with the network config instead of a hardcoded number that
// silently drifts when a vertical goes live (this is why the page said "9").
const ATLAS_COUNT = getAtlasCount()

export async function generateMetadata() {
  const t = await getTranslations('forCouncils')
  return {
    title: t('metaTitle'),
    description: t('metaDescription', { count: ATLAS_COUNT }),
  }
}

async function getNetworkStats() {
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

// FAQ keys drive translation lookups (question/answer strings live in messages).
const FAQ_KEYS = ['1', '2', '3', '4', '5', '6']

export default async function ForCouncilsPage() {
  const stats = await getNetworkStats()
  const t = await getTranslations('forCouncils')

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Free founding beta banner */}
      <div style={{
        background: 'var(--color-ink)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          maxWidth: 820, margin: '0 auto', padding: '14px 1.5rem',
          display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center',
          textAlign: 'center', flexWrap: 'wrap',
        }}>
          <span style={{
            flexShrink: 0,
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--color-ink)', background: 'var(--color-sage)',
            padding: '3px 10px', borderRadius: 99,
          }}>
            {t('bannerBadge')}
          </span>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, margin: 0,
          }}>
            {t('bannerText')}
          </p>
        </div>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem 3.5rem', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          {t('heroEyebrow')}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 44px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 16,
        }}>
          {t('heroTitleLine1')}<br />{t('heroTitleLine2')}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 560, margin: '0 auto',
        }}>
          {t('heroSubtitle', {
            listings: stats.listings.toLocaleString(),
            count: ATLAS_COUNT,
            regions: stats.regions,
          })}
        </p>
      </section>

      {/* What we are */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '0 1.5rem 4rem',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 32,
      }}>
        {[
          {
            title: t('whatCard1Title', { count: ATLAS_COUNT }),
            desc: t('whatCard1Desc'),
          },
          {
            title: t('whatCard2Title', { listings: stats.listings.toLocaleString() }),
            desc: t('whatCard2Desc'),
          },
          {
            title: t('whatCard3Title', { regions: stats.regions }),
            desc: t('whatCard3Desc'),
          },
        ].map(item => (
          <div key={item.title} style={{
            background: 'white', borderRadius: 12, padding: '28px 24px',
            border: '1px solid var(--color-border)',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
              color: 'var(--color-ink)', marginBottom: 10,
            }}>
              {item.title}
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
            }}>
              {item.desc}
            </p>
          </div>
        ))}
      </section>

      {/* Why it matters for councils */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
          }}>
            {t('whyEyebrow')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 24,
          }}>
            {t('whyTitle')}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              {t('whyPara1')}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              {t('whyPara2')}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              {t('whyPara3')}
            </p>
          </div>
        </div>
      </section>

      {/* GEO/SEO Discovery Landscape */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
          }}>
            {t('discoveryEyebrow')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 12,
          }}>
            {t('discoveryTitle')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 560, margin: '0 auto',
          }}>
            {t('discoveryIntro')}
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24,
        }}>
          {/* SEO Column */}
          <div style={{
            padding: '28px 24px', borderRadius: 12,
            border: '1px solid var(--color-border)', background: 'white',
          }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginBottom: 10,
            }}>
              {t('seoLabel')}
            </p>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
              color: 'var(--color-ink)', marginBottom: 10,
            }}>
              {t('seoTitle')}
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 16px',
            }}>
              {t('seoDesc')}
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {[
                t('seoFeature1'),
                t('seoFeature2'),
                t('seoFeature3'),
                t('seoFeature4', { count: ATLAS_COUNT }),
              ].map((f, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
                  color: 'var(--color-ink)', marginBottom: 6, lineHeight: 1.4,
                }}>
                  <span style={{ color: 'var(--color-sage)', flexShrink: 0, marginTop: 1 }}>&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* GEO Column */}
          <div style={{
            padding: '28px 24px', borderRadius: 12,
            border: '2px solid var(--color-sage)', background: 'white',
            position: 'relative',
          }}>
            <span style={{
              position: 'absolute', top: -11, left: 20,
              background: 'var(--color-sage)', color: 'white',
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '3px 10px', borderRadius: 99,
            }}>
              {t('geoBadge')}
            </span>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--color-sage)', marginBottom: 10,
            }}>
              {t('geoLabel')}
            </p>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
              color: 'var(--color-ink)', marginBottom: 10,
            }}>
              {t('geoTitle')}
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 16px',
            }}>
              {t('geoDesc')}
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {[
                t('geoFeature1'),
                t('geoFeature2'),
                t('geoFeature3'),
                t('geoFeature4'),
              ].map((f, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
                  color: 'var(--color-ink)', marginBottom: 6, lineHeight: 1.4,
                }}>
                  <span style={{ color: 'var(--color-sage)', flexShrink: 0, marginTop: 1 }}>&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Why Early Presence Matters */}
          <div style={{
            padding: '28px 24px', borderRadius: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-cream)',
          }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginBottom: 10,
            }}>
              {t('earlyEyebrow')}
            </p>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
              color: 'var(--color-ink)', marginBottom: 10,
            }}>
              {t('earlyTitle')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
              }}>
                {t('earlyPara1')}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
              }}>
                {t('earlyPara2', { count: ATLAS_COUNT })}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                color: 'var(--color-ink)', lineHeight: 1.6, margin: 0,
              }}>
                {t('earlyPara3')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What a partnership looks like */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
          }}>
            {t('partnershipEyebrow')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25,
          }}>
            {t('partnershipTitle')}
          </h2>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24,
        }}>
          {[
            {
              title: t('partnerCard1Title'),
              desc: t('partnerCard1Desc'),
              icon: (
                <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                </svg>
              ),
            },
            {
              title: t('partnerCard2Title'),
              desc: t('partnerCard2Desc'),
              icon: (
                <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
              ),
            },
            {
              title: t('partnerCard3Title'),
              desc: t('partnerCard3Desc'),
              icon: (
                <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              ),
            },
            {
              title: t('partnerCard4Title'),
              desc: t('partnerCard4Desc'),
              icon: (
                <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                </svg>
              ),
            },
          ].map(item => (
            <div key={item.title} style={{
              padding: '24px', borderRadius: 12,
              border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            }}>
              <div style={{ marginBottom: 12 }}>{item.icon}</div>
              <h3 style={{
                fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                color: 'var(--color-ink)', marginBottom: 8,
              }}>
                {item.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
              }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Example report CTA */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Link
            href="/council/example"
            style={{
              display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: 'white', background: 'var(--color-sage)', padding: '12px 28px', borderRadius: 99,
              textDecoration: 'none',
            }}
          >
            {t('exampleReportCta')}
          </Link>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', marginTop: 12,
          }}>
            {t('exampleReportNote')}
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        padding: '4rem 1.5rem',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--color-sage)', marginBottom: 12,
            }}>
              {t('betaEyebrow')}
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
              color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 12,
            }}>
              {t('betaTitle')}
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: 580, margin: '0 auto',
            }}>
              {t('betaIntro')}
            </p>
          </div>

          {/* What founding-beta partners get — free. The clarity centrepiece. */}
          <div style={{
            background: 'var(--color-cream)', border: '1px solid var(--color-sage)',
            borderRadius: 14, padding: '28px', marginBottom: 28,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'white', background: 'var(--color-sage)',
                padding: '4px 12px', borderRadius: 99,
              }}>
                {t('freeDuringBeta')}
              </span>
              <h3 style={{
                fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
                color: 'var(--color-ink)', margin: 0,
              }}>
                {t('foundingPartnersGetTitle')}
              </h3>
            </div>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 18px',
            }}>
              {t('foundingPartnersGetIntro')}
            </p>
            <ul style={{
              margin: 0, padding: 0, listStyle: 'none',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px 24px',
            }}>
              {[
                t('betaFeature1'),
                t('betaFeature2'),
                t('betaFeature3'),
                t('betaFeature4'),
                t('betaFeature5'),
                t('betaFeature6'),
                t('betaFeature7'),
                t('betaFeature8'),
                t('betaFeature9'),
                t('betaFeature10'),
                t('betaFeature11'),
                t('betaFeature12'),
                t('betaFeature13'),
              ].map((f, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                  color: 'var(--color-ink)', lineHeight: 1.5,
                }}>
                  <span style={{ color: 'var(--color-sage)', flexShrink: 0, marginTop: 2 }}>&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Primary beta CTA — the single action on the page; lands on the enquiry form */}
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <Link
              href="/council/enquire"
              style={{
                display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                color: 'white', background: 'var(--color-sage)', padding: '14px 32px', borderRadius: 99,
                textDecoration: 'none',
              }}
            >
              {t('joinBetaCta')}
            </Link>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '12px 0 0',
            }}>
              {t('joinBetaNote')}
            </p>
          </div>

          <p style={{
            textAlign: 'center', marginTop: 24,
            fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
          }}>
            {t('alreadyHaveAccount')}{' '}
            <Link href="/council/login" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {t('signInLink')}
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25,
          }}>
            {t('faqTitle')}
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {FAQ_KEYS.map((k, i) => (
            <div key={k} style={{
              padding: '20px 0',
              borderBottom: i < FAQ_KEYS.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                color: 'var(--color-ink)', margin: '0 0 8px',
              }}>
                {t(`faq${k}Q`)}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.65, margin: 0,
              }}>
                {t(`faq${k}A`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section style={{
        background: 'var(--color-ink)',
        padding: '4rem 1.5rem',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'white', lineHeight: 1.25, marginBottom: 16,
          }}>
            {t('contactTitle')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, marginBottom: 8,
          }}>
            {t('contactPara1')}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 28,
          }}>
            {t('contactPara2')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <a
              href="mailto:councils@australianatlas.com.au"
              style={{
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                color: 'white', textDecoration: 'underline', textUnderlineOffset: 4,
              }}
            >
              councils@australianatlas.com.au
            </a>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link
                href="/council/enquire"
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'white', background: 'var(--color-sage)',
                  padding: '10px 24px', borderRadius: 99, textDecoration: 'none',
                  transition: 'opacity 0.15s',
                }}
              >
                {t('joinBetaCta')}
              </Link>
              <Link
                href="/council/login"
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)',
                  padding: '10px 24px', borderRadius: 99, textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
              >
                {t('councilLogin')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
