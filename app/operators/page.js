import Link from 'next/link'

export const metadata = { title: 'For Operators — Australian Atlas' }

export default function OperatorsPage() {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem 3.5rem', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          For Tour Operators & Travel Designers
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 44px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 16,
        }}>
          Build unforgettable<br />Australian itineraries
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 560, margin: '0 auto 32px',
        }}>
          Access the Australian Atlas network of verified independent venues to create curated
          collections, build trails, and share polished itineraries with your clients.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/operators/register"
            style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: '#fff', background: 'var(--color-sage)',
              padding: '12px 28px', borderRadius: 99, textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
          >
            Get started
          </Link>
          <Link
            href="/operators/login"
            style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: 'var(--color-ink)', border: '1px solid var(--color-border)',
              padding: '12px 28px', borderRadius: 99, textDecoration: 'none',
              background: 'white', transition: 'opacity 0.15s',
            }}
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Who it's for */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '0 1.5rem 4rem',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24,
      }}>
        {[
          {
            title: 'Day tour operators',
            desc: 'Build curated stop lists for your day tours with verified venue data, locations, and descriptions.',
            icon: (
              <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ),
          },
          {
            title: 'Multi-day tour companies',
            desc: 'Plan multi-day itineraries across regions with trail builder and day-by-day scheduling.',
            icon: (
              <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            ),
          },
          {
            title: 'Inbound travel agencies',
            desc: 'Source authentic Australian experiences for international clients with verified independent venues.',
            icon: (
              <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            ),
          },
          {
            title: 'Travel designers',
            desc: 'Create bespoke itineraries for high-end clients with shareable, branded collection links.',
            icon: (
              <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.764m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
              </svg>
            ),
          },
        ].map(item => (
          <div key={item.title} style={{
            background: 'white', borderRadius: 12, padding: '24px',
            border: '1px solid var(--color-border)',
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
      </section>

      {/* What you get */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--color-sage)', marginBottom: 12,
            }}>
              Platform
            </p>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
              color: 'var(--color-ink)', lineHeight: 1.25,
            }}>
              What you get
            </h2>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24,
          }}>
            {[
              {
                title: 'Curated venue collections',
                desc: 'Save and organise venues from across the Australian Atlas network into themed collections. Group by region, category, or experience type.',
                icon: (
                  <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                ),
              },
              {
                title: 'Trail builder',
                desc: 'Build multi-day itineraries with the trail builder. Drag and drop venues into a day-by-day schedule with maps and route planning.',
                icon: (
                  <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                ),
              },
              {
                title: 'PDF export',
                desc: 'Export your collections and trails as clean, print-ready PDFs. Designed to share with clients and include in proposals.',
                icon: (
                  <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                ),
              },
              {
                title: 'Shareable client links',
                desc: 'Share polished, branded itinerary pages with your clients via a unique link. No login required for them to view.',
                icon: (
                  <svg width="24" height="24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-1.94a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.757 8.25" />
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
        </div>
      </section>

      {/* Pricing */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 1.5rem' }}>
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
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24,
          maxWidth: 720, margin: '0 auto',
        }}>
          {[
            {
              name: 'Starter', price: '$499', period: '/year',
              desc: 'Everything you need to curate and share itineraries',
              features: [
                'Curated venue collections',
                'PDF export',
                'Trail builder',
                'Shareable client links',
                'Email support',
              ],
              highlighted: false,
            },
            {
              name: 'Pro', price: '$1,999', period: '/year',
              desc: 'For teams that need more power and priority access',
              features: [
                'Everything in Starter',
                'Team members',
                'Priority support',
                'API access (coming soon)',
                'Custom branding on shares',
              ],
              highlighted: true,
            },
          ].map(tier => (
            <div key={tier.name} style={{
              background: 'white', borderRadius: 12, padding: '28px 24px',
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
                href="/operators/register"
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
                Get started
              </Link>
            </div>
          ))}
        </div>

        <p style={{
          textAlign: 'center', marginTop: 24,
          fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
        }}>
          Already have an account?{' '}
          <Link href="/operators/login" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Sign in to your dashboard
          </Link>
        </p>
      </section>

      {/* CTA */}
      <section style={{
        background: 'var(--color-ink)',
        padding: '4rem 1.5rem',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'white', lineHeight: 1.25, marginBottom: 16,
          }}>
            Start building better itineraries
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, marginBottom: 28,
          }}>
            Access verified venue data from across the Australian Atlas network.
            Build collections, create trails, and share polished itineraries with your clients.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/operators/register"
              style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                color: 'white', background: 'var(--color-sage)',
                padding: '10px 24px', borderRadius: 99, textDecoration: 'none',
                transition: 'opacity 0.15s',
              }}
            >
              Get started
            </Link>
            <a
              href="mailto:operators@australianatlas.com.au"
              style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)',
                padding: '10px 24px', borderRadius: 99, textDecoration: 'none',
                transition: 'color 0.15s',
              }}
            >
              Contact us
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
