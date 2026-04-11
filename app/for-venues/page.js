import Link from 'next/link'
import FaqAccordion from './FaqAccordion'

export const metadata = {
  title: 'For Venues — Australian Atlas',
  description: 'Your venue is already on the map. Claim your listing on Australian Atlas to manage your details, add photos, and connect with visitors.',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

const TIERS = [
  {
    name: 'Free',
    price: '0',
    period: 'forever',
    description: 'Claim your listing and keep it accurate.',
    features: ['Verify ownership', 'Update basic info', 'Pin on the map', 'Appear in search results'],
    cta: 'Claim Your Free Listing',
    href: '/claim',
    highlight: false,
  },
  {
    name: 'Standard',
    price: '99',
    period: 'per year',
    description: 'Everything you need to stand out and convert visitors.',
    features: ['Everything in Free', 'Unlimited photos', 'Opening hours & contact details', 'Venue features & events', 'Awards & accolades', 'Booking & social links', 'Special offers & promotions', 'Enlarged map pin', 'Priority placement in search', 'Analytics dashboard', 'Featured in regional guides & discovery trails'],
    cta: 'Get Started',
    href: '/claim',
    highlight: true,
  },
]

const ALL_FEATURES = [
  { label: 'Listed in the directory', free: true, standard: true },
  { label: 'Pin on the map', free: true, standard: true },
  { label: 'Searchable by type, state & region', free: true, standard: true },
  { label: 'Venue name & location', free: true, standard: true },
  { label: 'Unlimited photos', free: false, standard: true },
  { label: 'Opening hours', free: false, standard: true },
  { label: 'Venue features & facilities', free: false, standard: true },
  { label: 'Events & programs', free: false, standard: true },
  { label: 'Awards & accolades', free: false, standard: true },
  { label: 'Booking & social links', free: false, standard: true },
  { label: 'Special offers & promotions', free: false, standard: true },
  { label: 'Enlarged map pin', free: false, standard: true },
  { label: 'Featured on homepage', free: false, standard: true },
  { label: 'Priority placement in search', free: false, standard: true },
  { label: 'Analytics dashboard', free: false, standard: true },
  { label: 'Featured in regional guides & discovery trails', free: false, standard: true },
]

function Check({ included }) {
  if (included) return <span style={{ color: 'var(--color-sage)', fontSize: 15 }}>&#10003;</span>
  return <span style={{ color: 'var(--color-border)', fontSize: 15 }}>&ndash;</span>
}

export default function ForVenuesPage({ searchParams }) {
  const vertical = searchParams?.vertical
  const verticalName = vertical ? VERTICAL_LABELS[vertical] : null

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ padding: '100px 24px 80px', textAlign: 'center', borderBottom: '1px solid var(--color-border)', background: 'var(--color-cream)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 16, fontFamily: 'var(--font-body)' }}>For Venues</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 5vw, 54px)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 24 }}>
            Your venue is already on the map
          </h1>
          <p style={{ fontSize: 17, color: 'var(--color-muted)', lineHeight: 1.7, marginBottom: 40, fontFamily: 'var(--font-body)' }}>
            {verticalName
              ? `Your venue is already listed on ${verticalName}. Claim your free listing to take control of your details, or upgrade for photos, featured placement, and more.`
              : 'Australian Atlas is the most comprehensive directory of independent venues across Australia. Claim your free listing to manage your details, or upgrade for photos, featured placement, and analytics.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/claim" style={{ display: 'inline-block', padding: '14px 32px', background: 'var(--color-sage)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4 }}>Claim Your Listing</Link>
            <Link href="/claim" style={{ display: 'inline-block', padding: '14px 32px', background: 'transparent', color: 'var(--color-ink)', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4, border: '1px solid var(--color-border)' }}>Find Your Venue</Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '72px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-cream)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 14, fontFamily: 'var(--font-body)', textAlign: 'center' }}>Pricing</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 400, color: 'var(--color-ink)', textAlign: 'center', marginBottom: 12 }}>Simple, transparent pricing</h2>
          <p style={{ fontSize: 15, color: 'var(--color-muted)', textAlign: 'center', marginBottom: 52, fontFamily: 'var(--font-body)' }}>No lock-in contracts. Cancel anytime.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {TIERS.map(tier => (
              <div key={tier.name} style={{ padding: '36px 32px', background: tier.highlight ? 'var(--color-ink)' : '#fff', border: tier.highlight ? 'none' : '1px solid var(--color-border)', borderRadius: 6, position: 'relative' }}>
                {tier.highlight && (
                  <div style={{ position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-sage)', color: '#fff', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '4px 14px', fontFamily: 'var(--font-body)', fontWeight: 600, borderRadius: '0 0 4px 4px' }}>Most Popular</div>
                )}
                <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', marginBottom: 12 }}>{tier.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                  {tier.price !== '0' && <span style={{ fontSize: 15, color: tier.highlight ? 'rgba(255,255,255,0.5)' : 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>$</span>}
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 400, color: tier.highlight ? '#fff' : 'var(--color-ink)', lineHeight: 1 }}>{tier.price === '0' ? 'Free' : tier.price}</span>
                </div>
                <div style={{ fontSize: 12, color: tier.highlight ? 'rgba(255,255,255,0.45)' : 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 16 }}>{tier.period}</div>
                <div style={{ fontSize: 13, color: tier.highlight ? 'rgba(255,255,255,0.7)' : 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 28, lineHeight: 1.5 }}>{tier.description}</div>
                <div style={{ marginBottom: 32 }}>
                  {tier.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                      <span style={{ color: 'var(--color-sage)', fontSize: 14, lineHeight: 1.4, flexShrink: 0 }}>&#10003;</span>
                      <span style={{ fontSize: 13, color: tier.highlight ? 'rgba(255,255,255,0.75)' : 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link href={tier.href} style={{ display: 'block', padding: '13px 24px', background: tier.highlight ? 'var(--color-sage)' : 'transparent', color: tier.highlight ? '#fff' : 'var(--color-ink)', textDecoration: 'none', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4, border: tier.highlight ? 'none' : '1px solid var(--color-border)', textAlign: 'center' }}>{tier.cta}</Link>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 20 }}>Billed annually. Cancel any time. Payments via Stripe.</p>
        </div>
      </section>

      {/* Feature comparison */}
      <section style={{ padding: '72px 24px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 14, fontFamily: 'var(--font-body)', textAlign: 'center' }}>What&apos;s Included</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 400, color: 'var(--color-ink)', textAlign: 'center', marginBottom: 48 }}>Every tier, in full</h2>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(2, 140px)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-cream)' }}>
              <div style={{ padding: '16px 24px' }} />
              {['Free', 'Standard'].map(t => (
                <div key={t} style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)' }}>{t}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(2, 140px)', borderBottom: '2px solid var(--color-border)', background: 'var(--color-cream)' }}>
              <div style={{ padding: '12px 24px', fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>per year</div>
              {['Free', '$99'].map(p => (
                <div key={p} style={{ padding: '12px 8px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--color-ink)', fontWeight: 400 }}>{p}</div>
              ))}
            </div>
            {ALL_FEATURES.map((f, i) => (
              <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(2, 140px)', borderBottom: i < ALL_FEATURES.length - 1 ? '1px solid var(--color-border)' : 'none', background: i % 2 === 0 ? '#fff' : 'var(--color-cream)' }}>
                <div style={{ padding: '14px 24px', fontSize: 14, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>{f.label}</div>
                <div style={{ padding: '14px 8px', textAlign: 'center' }}><Check included={f.free} /></div>
                <div style={{ padding: '14px 8px', textAlign: 'center' }}><Check included={f.standard} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '72px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-cream)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 14, fontFamily: 'var(--font-body)', textAlign: 'center' }}>How It Works</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 400, color: 'var(--color-ink)', textAlign: 'center', marginBottom: 52 }}>Claim your listing in minutes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24 }}>
            {[
              { n: '01', title: 'Find your venue', desc: 'Search for your venue across all nine Atlas Network directories.' },
              { n: '02', title: 'Submit your claim', desc: 'Tell us your name, email, and your role at the venue. We verify and hand you control.' },
              { n: '03', title: 'Manage your listing', desc: 'Update your details, add photos, and optionally upgrade for more visibility.' },
            ].map(step => (
              <div key={step.n} style={{ padding: '28px 24px', border: '1px solid var(--color-border)', borderRadius: 6, background: '#fff' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-sage)', opacity: 0.6, marginBottom: 12, lineHeight: 1 }}>{step.n}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>{step.title}</div>
                <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '72px 24px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 14, fontFamily: 'var(--font-body)', textAlign: 'center' }}>FAQ</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 400, color: 'var(--color-ink)', textAlign: 'center', marginBottom: 48 }}>Common questions</h2>
          <FaqAccordion />
          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 28 }}>
            Still have questions? <a href="mailto:hello@australianatlas.com.au" style={{ color: 'var(--color-sage)', textDecoration: 'none' }}>Get in touch</a>.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 400, color: 'var(--color-ink)', marginBottom: 20 }}>Ready to claim your listing?</h2>
          <p style={{ fontSize: 15, color: 'var(--color-muted)', lineHeight: 1.7, marginBottom: 36, fontFamily: 'var(--font-body)' }}>Your venue is already listed. Claim it for free today. No credit card required.</p>
          <Link href="/claim" style={{ display: 'inline-block', padding: '16px 40px', background: 'var(--color-sage)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4 }}>Claim Your Free Listing</Link>
        </div>
      </section>

    </div>
  )
}
