import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { getNetworkStats } from '@/lib/networkStats'
import { getTranslations, getLocale } from 'next-intl/server'

export const revalidate = 86400

export async function generateMetadata() {
  const t = await getTranslations('press')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      url: 'https://australianatlas.com.au/press',
    },
    twitter: {
      card: 'summary',
      title: t('metaTitle'),
      description: t('metaDescription'),
    },
  }
}

const verticals = [
  { key: 'sba', name: 'Small Batch Atlas', descKey: 'verticalSbaDesc' },
  { key: 'collection', name: 'Culture Atlas', descKey: 'verticalCollectionDesc' },
  { key: 'craft', name: 'Craft Atlas', descKey: 'verticalCraftDesc' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas', descKey: 'verticalFineGroundsDesc' },
  { key: 'rest', name: 'Rest Atlas', descKey: 'verticalRestDesc' },
  { key: 'field', name: 'Field Atlas', descKey: 'verticalFieldDesc' },
  { key: 'corner', name: 'Corner Atlas', descKey: 'verticalCornerDesc' },
  { key: 'found', name: 'Found Atlas', descKey: 'verticalFoundDesc' },
  { key: 'table', name: 'Table Atlas', descKey: 'verticalTableDesc' },
  { key: 'way', name: 'Way Atlas', descKey: 'verticalWayDesc' },
]

async function getPressStats() {
  const { listings: totalListings, regions: regionCount } = await getNetworkStats()
  try {
    const sb = getSupabaseAdmin()

    // Per-vertical counts
    const verticalCounts = {}
    for (const v of verticals) {
      let cq = sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active')
      cq = filterByVertical(cq, v.key, await relationHasVerticals(sb, 'listings'))
      const { count: c } = await cq
      verticalCounts[v.key] = c || 0
    }

    return { totalListings, regionCount, verticalCounts }
  } catch {
    return { totalListings, regionCount, verticalCounts: {} }
  }
}

export default async function PressPage() {
  const t = await getTranslations('press')
  const locale = await getLocale()
  const stats = await getPressStats()
  const today = new Date().toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Header */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem 3rem', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          {t('eyebrowMedia')}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 48px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 16,
        }}>
          {t('pageTitle')}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 auto',
        }}>
          {t('lastUpdated', { date: today })}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
          color: 'var(--color-muted)', lineHeight: 1.6, marginTop: 8,
          opacity: 0.7,
        }}>
          {t('liveStatsNote')}
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
            {t('eyebrowNetworkOverview')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 24,
          }}>
            {t('networkOverviewHeading')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              {t('networkOverviewPara1')}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              {t('networkOverviewPara2')}
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
          {t('eyebrowKeyFacts')}
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
          color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 28,
        }}>
          {t('keyFactsHeading')}
        </h2>

        <dl style={{ margin: 0, padding: 0 }}>
          {[
            { term: t('factFoundedTerm'), value: '2024' },
            { term: t('factCoverageTerm'), value: t('factCoverageValue') },
            { term: t('factListingsTerm'), value: t('factListingsValue', { count: stats.totalListings.toLocaleString() }) },
            { term: t('factRegionsTerm'), value: t('factRegionsValue', { count: stats.regionCount }) },
            {
              term: t('factVerticalsTerm'),
              value: t('factVerticalsValue', { count: verticals.length, names: verticals.map(v => v.name).join(', ') }),
            },
            { term: t('factEditorialTerm'), value: t('factEditorialValue') },
            { term: t('factTrailTerm'), value: t('factTrailValue') },
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

      {/* The Atlases */}
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
              {t('eyebrowNetwork')}
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
              color: 'var(--color-ink)', lineHeight: 1.25,
            }}>
              {t('networkHeading')}
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
                  {t(v.descKey)}
                </p>
                {stats.verticalCounts[v.key] > 0 && (
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: 'var(--color-ink)', margin: 0, opacity: 0.5,
                  }}>
                    {t('listingsCount', { count: stats.verticalCounts[v.key].toLocaleString() })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Media Contact */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '3.5rem 1.5rem 5rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
          }}>
            {t('eyebrowContact')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 20,
          }}>
            {t('contactHeading')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 0 20px',
          }}>
            {t('contactBody')}
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

    </div>
  )
}
