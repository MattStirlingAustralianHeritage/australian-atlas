import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

// ============================================================
// Event submissions — gated ahead of operator outreach.
// The full submission form (details + image upload + Stripe payment,
// see git history of this file) is intentionally not rendered until
// the events pipeline opens to the public. The route stays live so
// existing links and the sitemap entry keep resolving; the events
// tables, Stripe routes and pipeline code are untouched.
// ============================================================

export async function generateMetadata() {
  const t = await getTranslations('eventsSubmit')
  const metaTitle = t('metaTitle')
  const metaDescription = t('metaDescription')
  return {
    title: metaTitle,
    description: metaDescription,
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      url: 'https://australianatlas.com.au/events/submit',
    },
    twitter: {
      card: 'summary',
      title: metaTitle,
      description: metaDescription,
    },
  }
}

export default async function EventSubmitPage() {
  const t = await getTranslations('eventsSubmit')
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <section style={{ padding: '110px 24px 80px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 16,
          }}>
            {t('eyebrow')}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 5vw, 46px)',
            fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15,
            marginBottom: 20,
          }}>
            {t('heading')}
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto 32px',
            maxWidth: 460,
          }}>
            {t('body')}
          </p>
          <a
            href="mailto:hello@australianatlas.com.au?subject=Event submission"
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: '#fff', background: 'var(--color-sage)',
              padding: '14px 32px', borderRadius: 8, textDecoration: 'none',
            }}
          >
            hello@australianatlas.com.au
          </a>
          <p style={{ marginTop: 40 }}>
            <Link
              href="/events"
              style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                color: 'var(--color-sage)', textDecoration: 'none',
              }}
            >
              &larr; {t('browseUpcoming')}
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
