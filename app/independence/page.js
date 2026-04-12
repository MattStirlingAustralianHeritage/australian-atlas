import Link from 'next/link'
import { breadcrumbJsonLd } from '@/lib/jsonLd'

export const metadata = {
  title: 'The Independence Pledge | Australian Atlas',
  description: 'What "independent" means on Australian Atlas, why it matters, and how we verify every listing in the network.',
  openGraph: {
    title: 'The Independence Pledge | Australian Atlas',
    description: 'Every place on Australian Atlas is independently owned and operated. No chains. No franchises. No corporate groups.',
  },
}

export default function IndependencePage() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'The Independence Pledge', url: '/independence' },
  ])

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      {/* Hero */}
      <section style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '5rem 1.5rem 3rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-sage)',
          marginBottom: 12,
        }}>
          Our Standard
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(32px, 5vw, 52px)',
          fontWeight: 400,
          color: 'var(--color-ink)',
          lineHeight: 1.15,
          marginBottom: 20,
        }}>
          The Independence Pledge
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(15px, 2vw, 17px)',
          fontWeight: 300,
          color: 'var(--color-muted)',
          lineHeight: 1.7,
          maxWidth: 540,
          margin: '0 auto',
        }}>
          What it means to be on Australian Atlas.
        </p>
      </section>

      {/* The Pledge */}
      <section style={{
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <blockquote style={{
            margin: 0,
            padding: '28px 32px',
            borderLeft: '3px solid var(--color-sage)',
            background: 'var(--color-cream)',
            borderRadius: '0 10px 10px 0',
          }}>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(18px, 2.5vw, 22px)',
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'var(--color-ink)',
              lineHeight: 1.55,
              margin: 0,
            }}>
              Every place on Australian Atlas is independently owned and operated.
              No chains. No franchises. No corporate groups.
              Just people running places they believe in.
            </p>
          </blockquote>
        </div>
      </section>

      {/* What We Mean by Independent */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3.5rem 1.5rem',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-sage)',
          marginBottom: 12,
        }}>
          The Criteria
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 400,
          color: 'var(--color-ink)',
          lineHeight: 1.25,
          marginBottom: 28,
        }}>
          What we mean by independent
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[
            {
              title: 'Owner-operated or family-run',
              desc: 'The people behind the business are involved in running it day to day. Decisions are made by the people doing the work, not a board in another city.',
            },
            {
              title: 'Not part of a national or international chain',
              desc: 'No multi-site corporate brands. If it has hundreds of locations and a franchise model, it doesn\u2019t belong here.',
            },
            {
              title: 'Makes its own decisions',
              desc: 'The menu, the stock, the opening hours, the character of the place \u2014 these are chosen by the operator, not dictated by a head office.',
            },
            {
              title: 'Connected to place and community',
              desc: 'The best independent places are shaped by where they are. They source locally, respond to their community, and contribute to the character of a town or region.',
            },
          ].map((item) => (
            <div key={item.title} style={{
              padding: '22px 24px',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-card-bg)',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--color-ink)',
                margin: '0 0 8px',
              }}>
                {item.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 300,
                color: 'var(--color-muted)',
                lineHeight: 1.65,
                margin: 0,
              }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Why It Matters */}
      <section style={{
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-sage)',
            marginBottom: 12,
          }}>
            Why It Matters
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            lineHeight: 1.25,
            marginBottom: 24,
          }}>
            The case for independent
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              fontWeight: 300,
              color: 'var(--color-muted)',
              lineHeight: 1.75,
              margin: 0,
            }}>
              Independent businesses are the difference between a town that feels like
              somewhere and one that could be anywhere. They create the texture of a place:
              the bakery that opens at five, the bookshop that stocks local authors, the
              gallery in the old post office. When you spend money at an independent business,
              more of it stays in the community. The owner lives nearby, hires locally, and
              reinvests in the street they trade on.
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              fontWeight: 300,
              color: 'var(--color-muted)',
              lineHeight: 1.75,
              margin: 0,
            }}>
              Australia has always been shaped by people who start things in the places they
              love. A cellar door in the Adelaide Hills. A ceramics studio on the mid-north
              coast. A coffee roaster in a Hobart laneway. These aren&apos;t just businesses
              &mdash; they&apos;re expressions of skill, taste, and commitment to a place.
              They make regional Australia worth the drive.
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              fontWeight: 300,
              color: 'var(--color-muted)',
              lineHeight: 1.75,
              margin: 0,
            }}>
              But independent places are harder to find. They don&apos;t have the marketing
              budgets of chains. They don&apos;t appear at the top of algorithm-driven
              platforms. Australian Atlas exists to change that &mdash; to make the independent
              layer of this country visible, searchable, and easy to support.
            </p>
          </div>
        </div>
      </section>

      {/* Pull Quote */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3rem 1.5rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(20px, 3vw, 28px)',
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'var(--color-ink)',
          lineHeight: 1.5,
          margin: 0,
        }}>
          The best places in Australia are the ones somebody put their name to.
        </p>
      </section>

      {/* How We Verify */}
      <section style={{
        background: 'var(--color-cream)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-sage)',
            marginBottom: 12,
          }}>
            Verification
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            lineHeight: 1.25,
            marginBottom: 24,
          }}>
            How we verify independence
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 300,
            color: 'var(--color-muted)',
            lineHeight: 1.75,
            marginBottom: 28,
          }}>
            Keeping the network accurate is an ongoing process, not a one-time check.
            Here&apos;s how we do it.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              {
                title: 'Every listing is reviewed before publishing',
                desc: 'New listings go through a verification process before they appear on the network. We check ownership structure, business registration, and chain affiliation.',
              },
              {
                title: 'Community reporting keeps things honest',
                desc: 'Visitors and locals can flag listings that no longer meet the criteria. If a place has been acquired by a chain or closed its doors, we hear about it quickly.',
              },
              {
                title: 'Operators can claim their listing',
                desc: 'Business owners can claim their listing for free to keep details current. Claimed listings are verified directly with the operator and updated in real time.',
              },
              {
                title: 'We remove places that no longer qualify',
                desc: 'If a business changes hands, joins a franchise, or no longer operates independently, we remove it from the network. No exceptions, no grandfathering.',
              },
            ].map((item) => (
              <div key={item.title} style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--color-sage)',
                  flexShrink: 0,
                  marginTop: 7,
                }} />
                <div>
                  <h3 style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--color-ink)',
                    margin: '0 0 6px',
                  }}>
                    {item.title}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    fontWeight: 300,
                    color: 'var(--color-muted)',
                    lineHeight: 1.65,
                    margin: 0,
                  }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '4rem 1.5rem 5rem',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(22px, 3vw, 30px)',
          fontWeight: 400,
          color: 'var(--color-ink)',
          lineHeight: 1.3,
          marginBottom: 12,
        }}>
          Know an independent place that should be here?
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          fontWeight: 300,
          color: 'var(--color-muted)',
          lineHeight: 1.65,
          marginBottom: 28,
          maxWidth: 440,
          margin: '0 auto 28px',
        }}>
          If you know a place that&apos;s independently owned, genuinely good, and deserves
          to be found &mdash; we want to hear about it.
        </p>
        <Link
          href="/suggest"
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 500,
            color: 'white',
            background: 'var(--color-sage)',
            padding: '13px 32px',
            borderRadius: 8,
            textDecoration: 'none',
            transition: 'background 0.15s',
          }}
        >
          Suggest a place
        </Link>
      </section>
    </div>
  )
}
