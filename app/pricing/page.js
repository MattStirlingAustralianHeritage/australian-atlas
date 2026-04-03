import Link from 'next/link'

const tiers = [
  {
    name: 'Explorer',
    price: '$249',
    period: '/year',
    description: 'Understand your region on the Atlas network',
    features: [
      'View all listings in your region',
      'Basic region report',
      'Listing count by vertical',
      'Embeddable map widget',
      'Email support',
    ],
    cta: 'Get started',
    highlighted: false,
  },
  {
    name: 'Partner',
    price: '$3,500',
    period: '/year',
    description: 'Actively manage and promote your region',
    features: [
      'Everything in Explorer',
      'Full analytics dashboard',
      'Listing performance data',
      'Content co-creation tools',
      'Create itineraries & editorials',
      'Regional picks curation',
      'Priority support',
    ],
    cta: 'Become a partner',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '$8,500',
    period: '/year',
    description: 'Full regional control across the network',
    features: [
      'Everything in Partner',
      'Multiple regions',
      'API access to listing data',
      'White-label reports',
      'Custom data exports',
      'Dedicated account manager',
      'Priority event promotion',
    ],
    cta: 'Contact us',
    highlighted: false,
  },
]

export const metadata = {
  title: 'Pricing — Councils & Tourism Bodies | Australian Atlas',
  description: 'Regional councils and tourism bodies can access listing data, analytics, and content tools for their region on the Australian Atlas network.',
}

export default function PricingPage() {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '5rem 1.5rem 3rem', maxWidth: '700px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.75rem',
          fontWeight: 500,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-sage)',
          marginBottom: '0.75rem',
        }}>
          For Councils & Tourism Bodies
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2.5rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          lineHeight: 1.15,
          marginBottom: '1rem',
        }}>
          Your region on Australia's independent network
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.05rem',
          color: 'var(--color-muted)',
          lineHeight: 1.6,
          maxWidth: '560px',
          margin: '0 auto',
        }}>
          Australian Atlas maps independent businesses across 9 verticals — from wineries and galleries to boutique stays and vintage shops. See what's in your region and help it thrive.
        </p>
      </section>

      {/* Pricing cards */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '0 1.5rem 4rem',
      }}>
        {tiers.map(tier => (
          <div key={tier.name} style={{
            background: '#fff',
            borderRadius: '16px',
            border: tier.highlighted ? '2px solid var(--color-sage)' : '1px solid var(--color-border)',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}>
            {tier.highlighted && (
              <span style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--color-sage)',
                color: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
              }}>
                Most popular
              </span>
            )}

            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 400,
              color: 'var(--color-ink)',
              margin: '0 0 0.375rem',
            }}>
              {tier.name}
            </h3>

            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'var(--color-muted)',
              margin: '0 0 1.25rem',
              lineHeight: 1.4,
            }}>
              {tier.description}
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '2.25rem',
                fontWeight: 600,
                color: 'var(--color-ink)',
              }}>
                {tier.price}
              </span>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                color: 'var(--color-muted)',
              }}>
                {tier.period}
              </span>
            </div>

            <ul style={{ margin: '0 0 2rem', padding: 0, listStyle: 'none', flex: 1 }}>
              {tier.features.map((feature, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  color: 'var(--color-ink)',
                  marginBottom: '0.625rem',
                  lineHeight: 1.4,
                }}>
                  <span style={{ color: 'var(--color-sage)', flexShrink: 0, marginTop: '2px' }}>✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href={`/council/enquire?plan=${tier.name.toLowerCase()}`}
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '0.8rem 1rem',
                borderRadius: '8px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'all 0.15s',
                ...(tier.highlighted
                  ? { background: 'var(--color-sage)', color: '#fff', border: 'none' }
                  : { background: '#fff', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }
                ),
              }}
            >
              {tier.cta}
            </Link>
            <p style={{
              textAlign: 'center',
              marginTop: '0.75rem',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'var(--color-muted)',
            }}>
              Existing account?{' '}
              <Link href="/council/login" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                Sign in
              </Link>
            </p>
          </div>
        ))}
      </section>

      {/* FAQ / Bottom section */}
      <section style={{
        maxWidth: '700px',
        margin: '0 auto',
        padding: '2rem 1.5rem 5rem',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          marginBottom: '1rem',
        }}>
          How it works
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem',
          textAlign: 'left',
        }}>
          {[
            { step: '1', title: 'Sign up', desc: 'Choose your plan and create your council account with a magic link — no password needed.' },
            { step: '2', title: 'Claim your region', desc: 'We assign your region and you get instant access to every independent listing in your area.' },
            { step: '3', title: 'Manage & promote', desc: 'View analytics, co-create content, and help your region thrive on the Atlas network.' },
          ].map(item => (
            <div key={item.step}>
              <span style={{
                display: 'inline-block',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--color-sage)',
                color: '#fff',
                textAlign: 'center',
                lineHeight: '28px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
              }}>
                {item.step}
              </span>
              <h3 style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--color-ink)',
                margin: '0 0 0.375rem',
              }}>
                {item.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'var(--color-muted)',
                lineHeight: 1.5,
                margin: 0,
              }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '3rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'var(--color-muted)',
            marginBottom: '0.75rem',
          }}>
            Questions? Get in touch.
          </p>
          <a
            href="mailto:hello@australianatlas.com.au"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              color: 'var(--color-sage)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            hello@australianatlas.com.au
          </a>
        </div>
      </section>
    </div>
  )
}
