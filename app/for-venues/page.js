import Link from 'next/link'
import FaqAccordion from './FaqAccordion'

const FOR_VENUES_DESCRIPTION = 'Your venue was chosen for the Atlas on merit — that can’t be bought. Claim your free listing to keep your facts current, or upgrade to Standard to make the most of it.'

export const metadata = {
  title: 'For Venues — Australian Atlas',
  description: FOR_VENUES_DESCRIPTION,
  openGraph: {
    title: 'For Venues — Australian Atlas',
    description: FOR_VENUES_DESCRIPTION,
    url: 'https://www.australianatlas.com.au/for-venues',
  },
  twitter: {
    card: 'summary',
    title: 'For Venues — Australian Atlas',
    description: FOR_VENUES_DESCRIPTION,
  },
}

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

const PILLARS = [
  {
    label: 'Presence',
    desc: 'A deep, verified, alive profile — your story, photos, events, offers and hours, kept current instead of left to gather dust.',
  },
  {
    label: 'Intelligence',
    desc: 'The only analytics of their kind: search demand for venues like yours, plus the AI Visibility Report — when GPTBot, ClaudeBot and Perplexity fetch your page, and when it’s pulled live into AI conversations.',
  },
  {
    label: 'Service',
    desc: 'The Atlas writes and maintains your story from a guided interview, keeps your page fresh with seasonal refreshes, and hands you a ready-made share kit.',
  },
  {
    label: 'Distribution',
    desc: 'A printable QR kit for the counter, an embeddable Atlas card for your own website, and an Atlas Trade opt-in that puts you in front of group and tour buyers.',
  },
]

const TIERS = [
  {
    name: 'Free',
    price: '0',
    period: 'forever',
    description: 'Verified ownership. Keep your facts current.',
    features: ['Verified ownership', 'Keep facts current — hours, contact, closure flag', 'Pin on the map', 'Appear in search & trails'],
    cta: 'Claim Your Free Listing',
    href: '/claim',
    highlight: false,
  },
  {
    name: 'Standard',
    price: '295',
    period: 'per year',
    description: 'The full Atlas working for your venue, all year.',
    features: [
      'Everything in Free',
      'Full listing editing — hours, contact & description with AI polish',
      'Photo gallery — 15 images, moderated',
      'Up to 3 live events',
      'Current offers & awards on your page',
      'Venue Q&A',
      '“Right now” highlights & hiring flag',
      'Up to 15 search keywords',
      'One suggested day-trip trail',
      'Picks — your recommendations, under your Atlas’s own label',
      'Listing Insights analytics & peer benchmarks',
      'AI Visibility Report',
      'Weekly “Your Atlas Week” email digest',
      'Share kit — printable QR card & embeddable Atlas card',
      'Your story, written by the Atlas from a guided interview',
      'Atlas Trade opt-in for group & tour buyers',
      'A referral code that rewards you for bringing in fellow independents',
    ],
    cta: 'Get Started',
    href: '/claim',
    highlight: true,
  },
]

const ALL_FEATURES = [
  { label: 'Listed in the directory', free: true, standard: true },
  { label: 'Verified ownership', free: true, standard: true },
  { label: 'Pin on the map', free: true, standard: true },
  { label: 'Appear in search & trails', free: true, standard: true },
  { label: 'Keep facts current — hours, contact, closure flag', free: true, standard: true },
  { label: 'Description editing with AI polish', free: false, standard: true },
  { label: 'Photo gallery — 15 images, moderated', free: false, standard: true },
  { label: 'Live events — up to 3', free: false, standard: true },
  { label: 'Current offers & awards on your page', free: false, standard: true },
  { label: 'Venue Q&A', free: false, standard: true },
  { label: '“Right now” highlights & hiring flag', free: false, standard: true },
  { label: 'Search keywords — up to 15', free: false, standard: true },
  { label: 'One suggested day-trip trail', free: false, standard: true },
  { label: 'Picks — your recommendations', free: false, standard: true },
  { label: 'Listing Insights & peer benchmarks', free: false, standard: true },
  { label: 'AI Visibility Report', free: false, standard: true },
  { label: '“Your Atlas Week” weekly digest', free: false, standard: true },
  { label: 'Share kit — QR card & embeddable Atlas card', free: false, standard: true },
  { label: 'Your story, written by the Atlas', free: false, standard: true },
  { label: 'Atlas Trade opt-in', free: false, standard: true },
  { label: 'Referral rewards', free: false, standard: true },
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
            Your venue was chosen on merit
          </h1>
          <p style={{ fontSize: 17, color: 'var(--color-muted)', lineHeight: 1.7, marginBottom: 40, fontFamily: 'var(--font-body)' }}>
            {verticalName
              ? `Your venue was chosen for ${verticalName} on merit — that can’t be bought. Standard makes the most of it. Claim your free listing to keep your facts current, or upgrade for the full Atlas working on your behalf.`
              : 'Your venue was chosen for the Atlas on merit — that can’t be bought. Standard makes the most of it. Claim your free listing to keep your facts current, or upgrade for the full Atlas working on your behalf.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/claim" style={{ display: 'inline-block', padding: '14px 32px', background: 'var(--color-sage)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4 }}>Claim Your Listing</Link>
            <Link href="/claim" style={{ display: 'inline-block', padding: '14px 32px', background: 'transparent', color: 'var(--color-ink)', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4, border: '1px solid var(--color-border)' }}>Find Your Venue</Link>
          </div>
        </div>
      </section>

      {/* Four pillars */}
      <section style={{ padding: '72px 24px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 14, fontFamily: 'var(--font-body)', textAlign: 'center' }}>What Standard Buys</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 400, color: 'var(--color-ink)', textAlign: 'center', marginBottom: 52 }}>Four things, done properly</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            {PILLARS.map(pillar => (
              <div key={pillar.label} style={{ padding: '28px 24px', border: '1px solid var(--color-border)', borderRadius: 6, background: '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', marginBottom: 12 }}>{pillar.label}</div>
                <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>{pillar.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ranking plank */}
      <section style={{ padding: '56px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-ink)', textAlign: 'center' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 16, fontFamily: 'var(--font-body)' }}>Our Promise</div>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 2.6vw, 28px)', fontWeight: 400, color: '#fff', lineHeight: 1.5, margin: 0 }}>
            Ranking is never for sale — not to you, not to your competitor. Atlas results are ranked by relevance and editorial curation only.
          </p>
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
              {['Free', '$295'].map(p => (
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
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 20 }}>Nothing here changes where you rank. Search, map and discovery ordering are editorial — always.</p>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '72px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-cream)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 14, fontFamily: 'var(--font-body)', textAlign: 'center' }}>How It Works</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 400, color: 'var(--color-ink)', textAlign: 'center', marginBottom: 52 }}>Claim your listing in minutes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24 }}>
            {[
              { n: '01', title: 'Find your venue', desc: 'Search for your venue across all ten Atlas Network directories.' },
              { n: '02', title: 'Submit your claim', desc: 'Tell us your name, email, and your role at the venue. We verify and hand you control.' },
              { n: '03', title: 'Manage your listing', desc: 'Keep your facts current for free, or upgrade to Standard to make the most of your place in the Atlas.' },
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
          <p style={{ fontSize: 15, color: 'var(--color-muted)', lineHeight: 1.7, marginBottom: 36, fontFamily: 'var(--font-body)' }}>Your venue is already listed — it earned its place. Claim it for free today. No credit card required.</p>
          <Link href="/claim" style={{ display: 'inline-block', padding: '16px 40px', background: 'var(--color-sage)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4 }}>Claim Your Free Listing</Link>
        </div>
      </section>

    </div>
  )
}
