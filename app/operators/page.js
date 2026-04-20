import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const revalidate = 86400

export const metadata = {
  title: 'For Operators | Australian Atlas',
  description: 'Claim your free listing on Australian Atlas — the independent guide to independent Australia. Keep your details accurate, reach travellers looking for places like yours, and connect with other operators across the network.',
  openGraph: {
    title: 'For Operators | Australian Atlas',
    description: 'Claim your free listing on Australian Atlas — the independent guide to independent Australia. Keep your details accurate, reach travellers looking for places like yours, and connect with other operators across the network.',
    url: 'https://australianatlas.com.au/operators',
  },
}

async function getStats() {
  try {
    const sb = getSupabaseAdmin()
    const [{ count: totalListings }, { count: claimedListings }, { count: regions }] = await Promise.all([
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('claimed', true),
      sb.from('regions').select('*', { count: 'exact', head: true }),
    ])
    return {
      totalListings: totalListings || 0,
      claimedListings: claimedListings || 0,
      regions: regions || 0,
    }
  } catch {
    return { totalListings: 6881, claimedListings: 0, regions: 46 }
  }
}

const BENEFITS = [
  {
    title: 'Keep your details accurate',
    body: 'Hours, phone number, website, description — you control what travellers see. No more outdated information or AI-generated guesswork.',
  },
  {
    title: 'Appear across nine atlases',
    body: 'Your listing reaches travellers specifically searching for independent places — across Small Batch, Craft, Fine Grounds, Rest, Table, and more.',
  },
  {
    title: 'Get found through trails and collections',
    body: 'Curated trails and regional collections surface your listing alongside complementary venues. Travellers planning a route find you in context, not in a search dump.',
  },
  {
    title: 'Recommend places you love',
    body: 'Producer Picks lets you highlight other independents — the winery down the road, the ceramicist next door. Cross-promotion that benefits the whole community.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Find your listing',
    body: 'Search for your venue on Australian Atlas. If you are an independent operator in Australia, there is a good chance we have already listed you.',
  },
  {
    number: '02',
    title: 'Claim it',
    body: 'Verify that you are the owner or manager. We will confirm your identity and hand over control of the listing.',
  },
  {
    number: '03',
    title: 'Make it yours',
    body: 'Update your details, add your own description, set your hours, and start connecting with the travellers who are looking for places like yours.',
  },
]

const FEATURES = [
  'Full listing management — photos, hours, description',
  'Listing Insights — views, search appearances, saves, trail inclusions',
  'Producer Picks — recommend other venues you love',
  'Direct link to your website (we never act as a booking intermediary)',
  'Appear in curated editorial trails and regional collections',
]

export default async function OperatorsPage() {
  const stats = await getStats()

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* ── Hero ── */}
      <section style={{
        maxWidth: 740,
        margin: '0 auto',
        padding: '6rem 1.5rem 4rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>
          For Independent Operators
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 5.5vw, 56px)',
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'var(--color-ink)',
          lineHeight: 1.15,
          margin: '0 0 24px',
          letterSpacing: '-0.01em',
        }}>
          Your place, on the map
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(16px, 2vw, 19px)',
          fontWeight: 300,
          color: 'var(--color-muted)',
          lineHeight: 1.6,
          margin: '0 auto 36px',
          maxWidth: 560,
        }}>
          Australian Atlas is the independent guide to independent Australia.
          We built it for the people who make these places worth visiting &mdash; and that starts with you.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/claim"
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: 'white', background: 'var(--color-sage)',
              padding: '12px 28px', borderRadius: 8, textDecoration: 'none',
              transition: 'background 0.15s',
            }}
          >
            Find your listing
          </Link>
          <Link
            href="/suggest"
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: 'var(--color-ink)', border: '1px solid var(--color-border)',
              padding: '12px 28px', borderRadius: 8, textDecoration: 'none',
              background: 'white', transition: 'border-color 0.15s',
            }}
          >
            Suggest a new listing
          </Link>
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{
        maxWidth: 60,
        margin: '0 auto',
        borderTop: '1px solid var(--color-border)',
      }} />

      {/* ── Why Claim ── */}
      <section style={{
        maxWidth: 740,
        margin: '0 auto',
        padding: '3.5rem 1.5rem',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 8, textAlign: 'center',
        }}>
          Why claim your listing
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 30px)',
          fontWeight: 400, color: 'var(--color-ink)', marginBottom: 12,
          textAlign: 'center',
        }}>
          Built for operators, not against them
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto 36px',
          maxWidth: 520, textAlign: 'center',
        }}>
          No commissions. No booking intermediary. No algorithm you have to pay to beat.
          We send people to your door and your website &mdash; that is the whole model.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 32,
        }}>
          {BENEFITS.map(benefit => (
            <div key={benefit.title}>
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 400,
                fontStyle: 'italic',
                color: 'var(--color-ink)',
                margin: '0 0 8px',
              }}>
                {benefit.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
              }}>
                {benefit.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section style={{
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 740,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 8, textAlign: 'center',
          }}>
            How it works
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 30px)',
            fontWeight: 400, color: 'var(--color-ink)', marginBottom: 36,
            textAlign: 'center',
          }}>
            Three steps, then it is yours
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 32,
          }}>
            {STEPS.map(step => (
              <div key={step.number}>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                  letterSpacing: '0.1em', color: 'var(--color-sage)',
                  margin: '0 0 10px',
                }}>
                  {step.number}
                </p>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: 'var(--color-ink)',
                  margin: '0 0 8px',
                }}>
                  {step.title}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                  color: 'var(--color-muted)', lineHeight: 1.7, margin: 0,
                }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What Operators Get ── */}
      <section style={{
        maxWidth: 740,
        margin: '0 auto',
        padding: '3.5rem 1.5rem',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 8, textAlign: 'center',
        }}>
          What you get
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 30px)',
          fontWeight: 400, color: 'var(--color-ink)', marginBottom: 36,
          textAlign: 'center',
        }}>
          Everything you need, nothing you do not
        </h2>

        <div style={{
          maxWidth: 520,
          margin: '0 auto',
        }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {FEATURES.map((feature, i) => (
              <li key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 0',
                borderBottom: i < FEATURES.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}>
                <span style={{
                  color: 'var(--color-sage)', flexShrink: 0, marginTop: 2,
                  fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 400,
                }}>
                  &#10003;
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
                  color: 'var(--color-ink)', lineHeight: 1.5,
                }}>
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(22px, 3vw, 30px)',
            fontWeight: 400,
            fontStyle: 'italic',
            color: 'var(--color-ink)',
            marginBottom: 14,
          }}>
            Claiming your listing is free. Always.
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto',
            maxWidth: 480,
          }}>
            Every operator can claim and manage their listing at no cost.
            We will never put your basic details behind a paywall.
            Optional featured placement is available for operators who want additional visibility,
            but it is never required.
          </p>
        </div>
      </section>

      {/* ── Stats ── */}
      {(stats.totalListings > 0 || stats.regions > 0) && (
        <section style={{
          maxWidth: 740,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 24,
            textAlign: 'center',
          }}>
            {stats.totalListings > 0 && (
              <div>
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(32px, 4vw, 44px)',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: 'var(--color-ink)',
                  margin: '0 0 4px',
                }}>
                  {stats.totalListings.toLocaleString()}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                  color: 'var(--color-muted)', margin: 0,
                }}>
                  verified listings
                </p>
              </div>
            )}
            {stats.claimedListings > 0 && (
              <div>
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(32px, 4vw, 44px)',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: 'var(--color-ink)',
                  margin: '0 0 4px',
                }}>
                  {stats.claimedListings.toLocaleString()}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                  color: 'var(--color-muted)', margin: 0,
                }}>
                  claimed by operators
                </p>
              </div>
            )}
            {stats.regions > 0 && (
              <div>
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(32px, 4vw, 44px)',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: 'var(--color-ink)',
                  margin: '0 0 4px',
                }}>
                  {stats.regions}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                  color: 'var(--color-muted)', margin: 0,
                }}>
                  regions covered
                </p>
              </div>
            )}
            <div>
              <p style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(32px, 4vw, 44px)',
                fontWeight: 400,
                fontStyle: 'italic',
                color: 'var(--color-ink)',
                margin: '0 0 4px',
              }}>
                9
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                color: 'var(--color-muted)', margin: 0,
              }}>
                specialist atlases
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Divider ── */}
      <div style={{
        maxWidth: 60,
        margin: '0 auto',
        borderTop: '1px solid var(--color-border)',
      }} />

      {/* ── CTA ── */}
      <section style={{
        background: 'var(--color-cream)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(22px, 3vw, 28px)',
            fontWeight: 400,
            fontStyle: 'italic',
            color: 'var(--color-ink)',
            marginBottom: 14,
          }}>
            If you built something worth visiting, it should be on the map
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 auto 28px',
            maxWidth: 480,
          }}>
            Claiming takes a few minutes. You will have full control of your listing
            and be part of the most comprehensive guide to independent Australia.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/claim"
              style={{
                display: 'inline-block',
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                color: 'white', background: 'var(--color-sage)',
                padding: '12px 28px', borderRadius: 8, textDecoration: 'none',
                transition: 'background 0.15s',
              }}
            >
              Find your listing
            </Link>
            <Link
              href="/suggest"
              style={{
                display: 'inline-block',
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                color: 'var(--color-ink)', border: '1px solid var(--color-border)',
                padding: '12px 28px', borderRadius: 8, textDecoration: 'none',
                background: 'white', transition: 'border-color 0.15s',
              }}
            >
              Suggest a new listing
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3.5rem 1.5rem 4.5rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.7, margin: '0 0 6px',
        }}>
          Questions about claiming or listing management?
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
          color: 'var(--color-muted)', margin: 0,
        }}>
          <a href="mailto:operators@australianatlas.com.au" style={{
            color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: 3,
          }}>
            operators@australianatlas.com.au
          </a>
        </p>
      </section>
    </div>
  )
}
