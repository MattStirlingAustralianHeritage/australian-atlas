import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getAtlasCount } from '@/lib/networkStats'

export const revalidate = 86400

const ATLAS_COUNT = getAtlasCount()

export async function generateMetadata() {
  const t = await getTranslations('forTrade')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
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

export default async function ForTradePage() {
  const stats = await getNetworkStats()
  const t = await getTranslations('forTrade')

  const FAQ = [
    { q: t('faqWhatIsQ'), a: t('faqWhatIsA') },
    { q: t('faqOperatorsQ'), a: t('faqOperatorsA') },
    { q: t('faqBookableQ'), a: t('faqBookableA') },
    { q: t('faqWhiteLabelQ'), a: t('faqWhiteLabelA') },
    { q: t('faqCostQ'), a: t('faqCostA') },
    { q: t('faqWhoRunsQ'), a: t('faqWhoRunsA') },
  ]

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Free founding beta banner */}
      <div style={{ background: 'var(--color-ink)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{
          maxWidth: 820, margin: '0 auto', padding: '14px 1.5rem',
          display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center',
          textAlign: 'center', flexWrap: 'wrap',
        }}>
          <span style={{
            flexShrink: 0,
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--color-ink)', background: 'var(--color-gold)',
            padding: '3px 10px', borderRadius: 99,
          }}>
            {t('betaBadge')}
          </span>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, margin: 0,
          }}>
            {t('betaBannerText')}
          </p>
        </div>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem 3.5rem', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-gold)', marginBottom: 12,
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
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 580, margin: '0 auto',
        }}>
          {t('heroSubhead', { count: stats.listings.toLocaleString() })}
        </p>
      </section>

      {/* What it is */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '0 1.5rem 4rem',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 32,
      }}>
        {[
          {
            title: t('cardNetworkTitle'),
            desc: t('cardNetworkDesc', {
              listings: stats.listings.toLocaleString(),
              categories: ATLAS_COUNT,
              regions: stats.regions,
            }),
          },
          {
            title: t('cardToolkitTitle'),
            desc: t('cardToolkitDesc'),
          },
          {
            title: t('cardProposalsTitle'),
            desc: t('cardProposalsDesc'),
          },
        ].map((item) => (
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

      {/* The independence proposition */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-gold)', marginBottom: 12,
          }}>
            {t('independenceEyebrow')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 24,
          }}>
            {t('independenceTitle')}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.7, margin: 0 }}>
              {t('independencePara1')}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.7, margin: 0 }}>
              {t('independencePara2')}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.7, margin: 0 }}>
              {t('independencePara3')}
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-gold)', marginBottom: 12,
          }}>
            {t('builderEyebrow')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25,
          }}>
            {t('builderTitle')}
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
          {[
            { n: '01', title: t('step1Title'), desc: t('step1Desc') },
            { n: '02', title: t('step2Title'), desc: t('step2Desc') },
            { n: '03', title: t('step3Title'), desc: t('step3Desc') },
            { n: '04', title: t('step4Title'), desc: t('step4Desc') },
          ].map((step) => (
            <div key={step.n} style={{
              padding: '24px', borderRadius: 12,
              border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--color-gold)', margin: '0 0 10px' }}>{step.n}</p>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 8 }}>
                {step.title}
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Beta access */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)', padding: '4rem 1.5rem',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--color-gold)', marginBottom: 12,
            }}>
              {t('foundingBetaEyebrow')}
            </p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 12 }}>
              {t('foundingBetaTitle')}
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: 600, margin: '0 auto' }}>
              {t('foundingBetaSubhead')}
            </p>
          </div>

          <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-gold)', borderRadius: 14, padding: '28px', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--color-ink)', background: 'var(--color-gold)',
                padding: '4px 12px', borderRadius: 99,
              }}>
                {t('freeDuringBetaBadge')}
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
                {t('foundingMembersGetTitle')}
              </h3>
            </div>
            <ul style={{
              margin: 0, padding: 0, listStyle: 'none',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px 24px',
            }}>
              {[
                t('benefitBuilder'),
                t('benefitNetwork'),
                t('benefitAttributedLinks'),
                t('benefitPdfExport'),
                t('benefitTradeSignals'),
                t('benefitFoundingRate'),
              ].map((f, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                  color: 'var(--color-ink)', lineHeight: 1.5,
                }}>
                  <span style={{ color: 'var(--color-gold)', flexShrink: 0, marginTop: 2 }}>&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <Link href="/for-trade/apply" style={{
              display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
              color: 'var(--color-ink)', background: 'var(--color-gold)', padding: '14px 32px', borderRadius: 99,
              textDecoration: 'none',
            }}>
              {t('joinFoundingBetaCta')}
            </Link>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '12px 0 0' }}>
              {t('joinGateNote')}
            </p>
          </div>

          <p style={{ textAlign: 'center', marginTop: 20, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>
            {t('alreadyMember')}{' '}
            <Link href="/trade/builder" style={{ color: 'var(--color-gold)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {t('openBuilderLink')}
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.25 }}>
            {t('faqHeading')}
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{ padding: '20px 0', borderBottom: i < FAQ.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <h3 style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'var(--color-ink)', margin: '0 0 8px' }}>
                {item.q}
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.65, margin: 0 }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section style={{ background: 'var(--color-ink)', padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'white', lineHeight: 1.25, marginBottom: 16 }}>
            {t('contactHeading')}
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, marginBottom: 28 }}>
            {t('contactBody')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <a href="mailto:trade@australianatlas.com.au" style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'white', textDecoration: 'underline', textUnderlineOffset: 4 }}>
              trade@australianatlas.com.au
            </a>
            <Link href="/for-trade/apply" style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: 'var(--color-ink)', background: 'var(--color-gold)',
              padding: '10px 24px', borderRadius: 99, textDecoration: 'none',
            }}>
              {t('joinFoundingBetaCta')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
