import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'For Regional Councils & Tourism Bodies | Australian Atlas',
  description: 'Partner with Australian Atlas to surface independent businesses in your region. Verified listings, editorial content, and discovery infrastructure across 9 categories.',
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

const FAQ = [
  {
    q: 'How does this sit alongside ATDW?',
    a: 'ATDW focuses on operator-submitted tourism listings. Australian Atlas covers the independent layer that those platforms typically miss: the small-batch winery that doesn\'t list on ATDW, the maker studio without a tourism accreditation, the vintage shop that\'s a genuine draw but isn\'t on any register. We\'re complementary infrastructure, not a replacement.',
  },
  {
    q: 'What does "verified" mean?',
    a: 'Every listing in our network is verified against its source data: confirmed active, correct location, validated contact details. We run automated audits across the full database and flag anything that fails. Venues marked as AI-generated carry a disclaimer and are excluded from editorial content until human-verified.',
  },
  {
    q: 'What commitment is required?',
    a: 'Plans run annually. The Explorer tier lets you understand what\'s already in your region before committing to anything deeper. There\'s no lock-in beyond the annual term, and you can upgrade or adjust at any time.',
  },
  {
    q: 'What regions are already active?',
    a: 'We have verified listings across every state and territory, with the deepest coverage in Victoria, New South Wales, South Australia, and Tasmania. Regional editorial content is growing, and council partnerships directly accelerate coverage in specific areas.',
  },
  {
    q: 'Can we contribute our own data?',
    a: 'Yes. Partner and Enterprise councils can submit listings, flag corrections, and co-create editorial content for their region. All submissions go through our verification pipeline before publishing.',
  },
  {
    q: 'Who runs Australian Atlas?',
    a: 'Australian Atlas is independently operated and Australian-owned. It\'s part of the Australian Heritage editorial network. The platform is built and maintained by a small team focused on documenting independent Australia.',
  },
]

export default async function ForCouncilsPage() {
  const stats = await getNetworkStats()

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem 3.5rem', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          For Regional Councils & Tourism Bodies
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 44px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 16,
        }}>
          Regional discovery infrastructure<br />for independent Australia
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 560, margin: '0 auto',
        }}>
          Australian Atlas is a verified, editorially curated network of {stats.listings.toLocaleString()} independent
          places across 9 categories and {stats.regions} regions. Built and operated in Australia.
        </p>
      </section>

      {/* What we are */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '0 1.5rem 4rem',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 32,
      }}>
        {[
          {
            title: '9 curated atlases',
            desc: 'Wineries and breweries. Galleries and heritage sites. Makers and studios. Coffee roasters. Boutique stays. Natural places. Independent retail. Vintage and antiques. Farm gates and food producers.',
          },
          {
            title: `${stats.listings.toLocaleString()} verified listings`,
            desc: 'Every listing is location-verified, contact-audited, and categorised across the network. No self-serve submissions without review. No paid placement.',
          },
          {
            title: `${stats.regions} regions mapped`,
            desc: 'From the Barossa to Byron, Gippsland to the Goldfields. Bounding-box geographic anchoring means every listing belongs to a real place, not a marketing label.',
          },
        ].map(item => (
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

      {/* Why it matters for councils */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
          }}>
            Why this matters
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 24,
          }}>
            The independent layer your existing platforms miss
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              Your region has an ATDW presence and a council tourism website. Those platforms
              cover accredited operators and major attractions. What they typically don&apos;t cover
              is the independent layer: the cellar door that opened last year, the ceramics
              studio operating from a converted shed, the vintage shop that draws weekend visitors
              from three hours away.
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              These places are often the actual reason people visit a region. Australian Atlas
              maps them systematically &mdash; verified, categorised, and positioned within a
              national discovery network that connects makers, producers, and cultural spaces
              across the country.
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
            }}>
              We&apos;re not competing with your existing tourism assets. We&apos;re filling the
              gap between what those platforms capture and what your region actually offers.
            </p>
          </div>
        </div>
      </section>

      {/* What a partnership looks like */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
          }}>
            Partnership
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25,
          }}>
            What working together looks like
          </h2>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24,
        }}>
          {[
            {
              title: 'Regional content co-creation',
              desc: 'Curate editorial trails, regional picks, and seasonal guides for your area. Your local knowledge, published through a platform that reaches independent-minded travellers nationally.',
              icon: (
                <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              ),
            },
            {
              title: 'Verified listing data',
              desc: 'Access the verified, categorised listing data for every independent business in your region. Know exactly what\'s operating, where, and in which category.',
              icon: (
                <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                </svg>
              ),
            },
            {
              title: 'Editorial visibility',
              desc: 'Your region featured editorially across the Australian Atlas network: homepage, discovery trails, regional pages, and the journal. Not an ad — a genuine editorial presence.',
              icon: (
                <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
              ),
            },
            {
              title: 'Analytics & reporting',
              desc: 'Understand how your region performs on the network: which listings are viewed, which trails feature your venues, and how visitors discover your area.',
              icon: (
                <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                </svg>
              ),
            },
          ].map(item => (
            <div key={item.title} style={{
              padding: '24px', borderRadius: 12,
              border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            }}>
              <div style={{ marginBottom: 12 }}>{item.icon}</div>
              <h3 style={{
                fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                color: 'var(--color-ink)', marginBottom: 8,
              }}>
                {item.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
              }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        padding: '4rem 1.5rem',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--color-sage)', marginBottom: 12,
            }}>
              Plans
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
              color: 'var(--color-ink)', lineHeight: 1.25,
            }}>
              Straightforward, annual pricing
            </h2>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20,
          }}>
            {[
              {
                name: 'Explorer', price: '$249', period: '/year',
                desc: 'Understand your region on the Atlas network',
                features: [
                  'View all listings in your region',
                  'Basic region report',
                  'Listing count by vertical',
                  'Embeddable map widget',
                  'Email support',
                ],
                highlighted: false,
              },
              {
                name: 'Partner', price: '$3,500', period: '/year',
                desc: 'Actively manage and promote your region',
                features: [
                  'Everything in Explorer',
                  'Full analytics dashboard',
                  'Listing performance data',
                  'Content co-creation tools',
                  'Create itineraries & editorials',
                  'Regional picks curation',
                  'Priority support',
                ],
                highlighted: true,
              },
              {
                name: 'Enterprise', price: '$8,500', period: '/year',
                desc: 'Full regional control across the network',
                features: [
                  'Everything in Partner',
                  'Multiple regions',
                  'API access to listing data',
                  'White-label reports',
                  'Custom data exports',
                  'Dedicated account manager',
                ],
                highlighted: false,
              },
            ].map(tier => (
              <div key={tier.name} style={{
                background: 'var(--color-bg)', borderRadius: 12, padding: '28px 24px',
                border: tier.highlighted ? '2px solid var(--color-sage)' : '1px solid var(--color-border)',
                position: 'relative', display: 'flex', flexDirection: 'column',
              }}>
                {tier.highlighted && (
                  <span style={{
                    position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--color-sage)', color: 'white',
                    fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '3px 12px', borderRadius: 99,
                  }}>
                    Recommended
                  </span>
                )}
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
                  color: 'var(--color-ink)', margin: '0 0 4px',
                }}>
                  {tier.name}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                  color: 'var(--color-muted)', margin: '0 0 16px',
                }}>
                  {tier.desc}
                </p>
                <div style={{ marginBottom: 20 }}>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 32, fontWeight: 600,
                    color: 'var(--color-ink)',
                  }}>
                    {tier.price}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 14,
                    color: 'var(--color-muted)',
                  }}>
                    {tier.period}
                  </span>
                </div>
                <ul style={{ margin: '0 0 24px', padding: 0, listStyle: 'none', flex: 1 }}>
                  {tier.features.map((f, i) => (
                    <li key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                      color: 'var(--color-ink)', marginBottom: 8, lineHeight: 1.4,
                    }}>
                      <span style={{ color: 'var(--color-sage)', flexShrink: 0, marginTop: 1 }}>&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/council/enquire?plan=${tier.name.toLowerCase()}`}
                  style={{
                    display: 'block', textAlign: 'center', padding: '10px 16px',
                    borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14,
                    fontWeight: 500, textDecoration: 'none', transition: 'opacity 0.15s',
                    ...(tier.highlighted
                      ? { background: 'var(--color-sage)', color: 'white', border: 'none' }
                      : { background: 'white', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }
                    ),
                  }}
                >
                  {tier.name === 'Enterprise' ? 'Contact us' : 'Get started'}
                </Link>
              </div>
            ))}
          </div>

          <p style={{
            textAlign: 'center', marginTop: 24,
            fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
          }}>
            Already have an account?{' '}
            <Link href="/council/login" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Sign in to your council dashboard
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25,
          }}>
            Common questions
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{
              padding: '20px 0',
              borderBottom: i < FAQ.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                color: 'var(--color-ink)', margin: '0 0 8px',
              }}>
                {item.q}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.65, margin: 0,
              }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section style={{
        background: 'var(--color-ink)',
        padding: '4rem 1.5rem',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'white', lineHeight: 1.25, marginBottom: 16,
          }}>
            Let&apos;s have a conversation
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, marginBottom: 8,
          }}>
            I&apos;m Matt, the founder of Australian Atlas. If you represent a council, a tourism body,
            or a regional organisation and want to talk about what a partnership could look like for
            your area, I&apos;d like to hear from you.
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 28,
          }}>
            Not a sales pitch &mdash; a genuine conversation about your region and how we might
            be useful.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <a
              href="mailto:councils@australianatlas.com.au"
              style={{
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                color: 'white', textDecoration: 'underline', textUnderlineOffset: 4,
              }}
            >
              councils@australianatlas.com.au
            </a>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link
                href="/pricing"
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'white', background: 'var(--color-sage)',
                  padding: '10px 24px', borderRadius: 99, textDecoration: 'none',
                  transition: 'opacity 0.15s',
                }}
              >
                View detailed pricing
              </Link>
              <Link
                href="/council/login"
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)',
                  padding: '10px 24px', borderRadius: 99, textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
              >
                Council login
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
