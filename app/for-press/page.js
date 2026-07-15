import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getNetworkStats, getAtlasCount } from '@/lib/networkStats'
import { PRESS_CONTACT_EMAIL } from '@/lib/press/config'

// For Press — the public pitch for the Newsroom (beta), in the house
// marketing-page recipe: ink beta banner, centred hero, live stats,
// feature grid, sizes columns, numbered how-it-works, promises, FAQ,
// ink contact band. Copy lives in the forPress i18n namespace.

export const revalidate = 86400

const ATLAS_COUNT = getAtlasCount()

export async function generateMetadata() {
  const t = await getTranslations('forPress')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      url: 'https://www.australianatlas.com.au/for-press',
    },
    twitter: {
      card: 'summary',
      title: t('metaTitle'),
      description: t('metaDescription'),
    },
  }
}

const SECTION_EYEBROW = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.15em', textTransform: 'uppercase',
  color: 'var(--color-sage)', marginBottom: 12,
}

const SECTION_HEADING = {
  fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 3vw, 32px)',
  fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2, margin: '0 0 14px',
}

export default async function ForPressPage() {
  const t = await getTranslations('forPress')
  const stats = await getNetworkStats()

  return (
    <div style={{ background: 'var(--color-bg)' }}>

      {/* Beta banner */}
      <div style={{ background: 'var(--color-ink)', padding: '0.65rem 1.5rem', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(250,248,245,0.85)', margin: 0 }}>
          <span style={{
            display: 'inline-block', marginRight: 10, padding: '0.14rem 0.6rem', borderRadius: 999,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'rgba(95,138,126,0.35)',
            border: '1px solid rgba(95,138,126,0.55)',
            color: '#a8c5bc',
            verticalAlign: 'middle',
          }}>
            {t('bannerBadge')}
          </span>
          {t('bannerText')}
        </p>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '4.5rem 1.5rem 3rem', textAlign: 'center' }}>
        <p style={SECTION_EYEBROW}>{t('heroEyebrow')}</p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 4.4vw, 46px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.12, margin: '0 0 18px',
        }}>
          {t('heroTitle')}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 15.5, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.65, margin: '0 auto 26px', maxWidth: 620,
        }}>
          {t('heroSubtitle')}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/newsroom/enquire" style={{
            display: 'inline-block', background: 'var(--color-sage)', color: '#fff',
            fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600,
            borderRadius: 99, padding: '0.75rem 1.9rem', textDecoration: 'none',
          }}>
            {t('ctaPrimary')}
          </Link>
          <Link href="/newsroom/example" style={{
            display: 'inline-block', background: 'transparent', color: 'var(--color-ink)',
            fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600,
            border: '1px solid rgba(28,26,23,0.25)',
            borderRadius: 99, padding: '0.75rem 1.9rem', textDecoration: 'none',
          }}>
            {t('ctaSecondary')}
          </Link>
        </div>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, marginTop: 18 }}>
          <Link href="/newsroom/login" style={{ color: 'var(--color-sage-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {t('ctaSignIn')}
          </Link>
        </p>
      </section>

      {/* Live stats band */}
      <section style={{ background: 'white', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '2.4rem 1.5rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 'clamp(1.5rem, 6vw, 4.5rem)', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              [stats.listings.toLocaleString(), t('statsPlaces')],
              [String(stats.regions), t('statsRegions')],
              [String(ATLAS_COUNT), t('statsGuides')],
            ].map(([value, label]) => (
              <div key={label}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--color-ink)', margin: '0 0 2px' }}>{value}</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, color: 'var(--color-muted)', margin: 0 }}>{label}</p>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 300, color: 'var(--color-muted)', margin: '1.3rem 0 0', opacity: 0.85 }}>
            {t('statsNote')}
          </p>
        </div>
      </section>

      {/* What lands on your desk */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <p style={SECTION_EYEBROW}>{t('deskEyebrow')}</p>
          <h2 style={SECTION_HEADING}>{t('deskHeading')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              background: 'var(--color-card-bg)', border: '1px solid var(--color-border)',
              borderRadius: 12, padding: '22px 22px 20px',
            }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--color-ink)', margin: '0 0 8px' }}>
                {t(`feature${i}Title`)}
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
                {t(`feature${i}Body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Every size of newsroom */}
      <section style={{ background: 'white', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '4rem 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <p style={SECTION_EYEBROW}>{t('sizesEyebrow')}</p>
            <h2 style={SECTION_HEADING}>{t('sizesHeading')}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                background: 'var(--color-cream)', border: '1px solid var(--color-border)',
                borderRadius: 12, padding: '24px 22px',
              }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 400, color: 'var(--color-ink)', margin: '0 0 10px' }}>
                  {t(`size${i}Title`)}
                </h3>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.65, margin: 0 }}>
                  {t(`size${i}Body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <p style={SECTION_EYEBROW}>{t('howEyebrow')}</p>
          <h2 style={SECTION_HEADING}>{t('howHeading')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ padding: '4px 6px' }}>
              <p style={{
                fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--color-sage)',
                margin: '0 0 8px', lineHeight: 1,
              }}>
                {i}
              </p>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, color: 'var(--color-ink)', margin: '0 0 6px' }}>
                {t(`how${i}Title`)}
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
                {t(`how${i}Body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Promises */}
      <section style={{ background: 'white', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '4rem 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <p style={SECTION_EYEBROW}>{t('promisesEyebrow')}</p>
            <h2 style={SECTION_HEADING}>{t('promisesHeading')}</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--color-sage)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, lineHeight: 1.55 }}>✓</span>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-ink)', lineHeight: 1.55, margin: 0 }}>
                  {t(`promise${i}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <p style={SECTION_EYEBROW}>{t('faqEyebrow')}</p>
          <h2 style={SECTION_HEADING}>{t('faqHeading')}</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <details key={i} style={{
              background: 'var(--color-card-bg)', border: '1px solid var(--color-border)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <summary style={{
                fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 550,
                color: 'var(--color-ink)', cursor: 'pointer', listStylePosition: 'outside',
              }}>
                {t(`faq${i}Q`)}
              </summary>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.65, margin: '10px 0 0' }}>
                {t(`faq${i}A`)}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Contact band */}
      <section style={{ background: 'var(--color-ink)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '3.6rem 1.5rem 4rem', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: '#faf8f5', margin: '0 0 10px' }}>
            {t('contactHeading')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'rgba(250,248,245,0.75)', lineHeight: 1.65, margin: '0 0 22px',
          }}>
            {t('contactBody')}
          </p>
          <a href={`mailto:${PRESS_CONTACT_EMAIL}`} style={{
            display: 'inline-block', background: 'var(--color-sage)', color: '#fff',
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
            borderRadius: 99, padding: '0.7rem 1.8rem', textDecoration: 'none',
          }}>
            {t('contactCta')}
          </a>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(250,248,245,0.55)', margin: '1rem 0 0' }}>
            {PRESS_CONTACT_EMAIL}
          </p>
        </div>
      </section>
    </div>
  )
}
