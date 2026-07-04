import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function generateMetadata() {
  const t = await getTranslations('pricing')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
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
    // Parallel, not 9 sequential round-trips.
    const verticalCountResults = await Promise.all(
      verticals.map(v =>
        sb.from('listings').select('*', { count: 'exact', head: true }).eq('vertical', v).eq('status', 'active')
          .then(r => r.count || 0)
      )
    )
    verticals.forEach((v, i) => { verticalCounts[v] = verticalCountResults[i] })

    return { listings: listings || 0, regions: regions || 0, claimed: claimed || 0, verticalCounts }
  } catch {
    return { listings: 0, regions: 0, claimed: 0, verticalCounts: {} }
  }
}

const VERTICALS = [
  { key: 'sba', name: 'Small Batch Atlas' },
  { key: 'collection', name: 'Culture Atlas' },
  { key: 'craft', name: 'Craft Atlas' },
  { key: 'fine_grounds', name: 'Fine Grounds Atlas' },
  { key: 'rest', name: 'Rest Atlas' },
  { key: 'field', name: 'Field Atlas' },
  { key: 'corner', name: 'Corner Atlas' },
  { key: 'found', name: 'Found Atlas' },
  { key: 'table', name: 'Table Atlas' },
]

export default async function PricingPage() {
  const t = await getTranslations('pricing')
  const stats = await getNetworkStats()

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ padding: '5rem 1.5rem 3rem', maxWidth: '720px', margin: '0 auto' }}>
        <p className="section-dateline" style={{ marginBottom: 14 }}>
          {t('heroDateline')}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '2.5rem',
          color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: '1.25rem',
        }}>
          {t('heroTitle')}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 16,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 600,
        }}>
          {t('heroLead')}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 16,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 600, marginTop: 16,
        }}>
          {t('heroStatsLine', {
            listings: stats.listings > 0 ? stats.listings.toLocaleString() : '6,800',
            regions: stats.regions || 46,
          })}
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
            { n: stats.listings > 0 ? stats.listings.toLocaleString() : '6,881', label: t('statVerifiedListings') },
            { n: '9', label: t('statCuratedAtlases') },
            { n: String(stats.regions || 46), label: t('statMappedRegions') },
            { n: stats.claimed > 0 ? stats.claimed.toLocaleString() : '—', label: t('statOperatorClaimed') },
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
          {t('statsCaption')}
        </p>
      </section>

      {/* What councils get */}
      <section style={{ padding: '3rem 1.5rem 4rem', maxWidth: '720px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          {t('getEyebrow')}
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.75rem',
          color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 32,
        }}>
          {t('getHeading')}
        </h2>

        <div style={{ display: 'grid', gap: 24 }}>
          {[
            {
              title: t('benefitDataAccessTitle'),
              desc: t('benefitDataAccessDesc'),
            },
            {
              title: t('benefitContentCoCreationTitle'),
              desc: t('benefitContentCoCreationDesc'),
            },
            {
              title: t('benefitCoverageGapTitle'),
              desc: t('benefitCoverageGapDesc'),
            },
            {
              title: t('benefitDemandDataTitle'),
              desc: t('benefitDemandDataDesc'),
            },
            {
              title: t('benefitNetworkReachTitle'),
              desc: t('benefitNetworkReachDesc'),
            },
            {
              title: t('benefitQualityManagementTitle'),
              desc: t('benefitQualityManagementDesc'),
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

      {/* The atlases */}
      <section style={{ padding: '3rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          {t('networkEyebrow')}
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.75rem',
          color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 24,
        }}>
          {t('networkHeading')}
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
                }}>{t(`verticalWhat_${v.key}`)}</p>
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
          {t('plansEyebrow')}
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.75rem',
          color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 8,
        }}>
          {t('plansHeading')}
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15,
          color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: 32, maxWidth: 560,
        }}>
          {t('plansIntro')}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { name: 'Explorer', price: '$249/yr', desc: t('planExplorerDesc') },
            { name: 'Partner', price: '$3,500/yr', desc: t('planPartnerDesc') },
            { name: 'Enterprise', price: t('planEnterprisePrice'), desc: t('planEnterpriseDesc') },
          ].map(tier => (
            <div key={tier.name} style={{
              padding: '24px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: '#fff',
            }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
                color: 'var(--color-ink)', marginBottom: 4,
              }}>{tier.name}</p>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
                color: 'var(--color-ink)', marginBottom: 12,
              }}>{tier.price}</p>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13,
                color: 'var(--color-muted)', lineHeight: 1.5, margin: 0,
              }}>{tier.desc}</p>
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
            {t('ctaHeading')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
            color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 24, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
          }}>
            {t('ctaBody')}
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
              {t('ctaPartnerLogin')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
