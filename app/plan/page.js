import Link from 'next/link'

const SITE_URL = 'https://australianatlas.com.au'
const GOLD = '#C4973B'

export const metadata = {
  title: 'Plan a trip — Australian Atlas',
  description: "Two ways to plan a trip across independent Australia — start from a route you already know, or tell us what you're into and we'll build the weekend.",
  alternates: { canonical: `${SITE_URL}/plan` },
  openGraph: {
    title: 'Plan a trip — Australian Atlas',
    description: "Two ways to plan a trip across independent Australia — start from a route you already know, or tell us what you're into and we'll build the weekend.",
    url: `${SITE_URL}/plan`,
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
}

// Mode cards rendered from an array so a third surface (trails) can slot in later.
const MODES = [
  {
    href: '/on-this-road',
    heading: "I know where I'm going",
    sub: "Set your route and we'll find the stops worth pulling over for.",
    cta: 'Plan a road trip',
  },
  {
    href: '/plan-a-stay',
    heading: 'Not sure where to go?',
    sub: "Tell us what you're into and we'll plan the weekend.",
    cta: 'Plan a weekend',
  },
]

export default function PlanPage() {
  return (
    <section style={{ background: 'var(--color-bg)', minHeight: '100vh', paddingBlock: '80px' }}>
      <div className="max-w-5xl mx-auto px-6 sm:px-12">
        <div className="text-center mb-10">
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(28px, 4vw, 44px)', color: 'var(--color-ink)', lineHeight: 1.15,
          }}>
            Plan a trip
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            color: 'var(--color-muted)', maxWidth: '480px', margin: '12px auto 0', lineHeight: 1.6,
          }}>
            Two ways in, depending on whether you&apos;ve already got a destination.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {MODES.map((mode) => (
            <Link
              key={mode.href}
              href={mode.href}
              className="group listing-card block rounded-2xl"
              style={{
                background: '#2C2420',
                border: '1px solid transparent',
                padding: '32px 28px',
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '26px',
                color: '#FAF8F4', lineHeight: 1.25, marginBottom: 10,
              }}>
                {mode.heading}
              </h2>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                color: 'rgba(250,248,244,0.6)', lineHeight: 1.6,
              }}>
                {mode.sub}
              </p>
              <div style={{ flex: 1, minHeight: 24 }} />
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: GOLD,
              }}>
                {mode.cta} &rarr;
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
