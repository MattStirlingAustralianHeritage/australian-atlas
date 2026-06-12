import Link from 'next/link'

// ============================================================
// Event submissions — gated ahead of operator outreach.
// The full submission form (details + image upload + Stripe payment,
// see git history of this file) is intentionally not rendered until
// the events pipeline opens to the public. The route stays live so
// existing links and the sitemap entry keep resolving; the events
// tables, Stripe routes and pipeline code are untouched.
// ============================================================

const SUBMIT_DESCRIPTION = 'Event submissions are opening soon on Australian Atlas. Register your interest by email and we will let you know the moment they open.'

export const metadata = {
  title: 'Submit an Event — Australian Atlas',
  description: SUBMIT_DESCRIPTION,
  openGraph: {
    title: 'Submit an Event — Australian Atlas',
    description: SUBMIT_DESCRIPTION,
    url: 'https://australianatlas.com.au/events/submit',
  },
  twitter: {
    card: 'summary',
    title: 'Submit an Event — Australian Atlas',
    description: SUBMIT_DESCRIPTION,
  },
}

export default function EventSubmitPage() {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <section style={{ padding: '110px 24px 80px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 16,
          }}>
            Events
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 5vw, 46px)',
            fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15,
            marginBottom: 20,
          }}>
            Event submissions are opening soon
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto 32px',
            maxWidth: 460,
          }}>
            We&apos;re putting the finishing touches on event listings across the
            Atlas network. If you run a festival, market, dinner, tour, exhibition
            or workshop, email us and we&apos;ll let you know the moment submissions open.
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
              &larr; Browse upcoming events
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
