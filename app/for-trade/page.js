import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getAtlasCount } from '@/lib/networkStats'

export const revalidate = 86400

const ATLAS_COUNT = getAtlasCount()

export const metadata = {
  title: 'Atlas Trade — for tour operators, DMCs & trip designers | Australian Atlas',
  description:
    'A pre-vetted set of independent Australian operators and an attributed itinerary builder, for the travel trade. Free founding beta.',
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
    q: 'What exactly is Atlas Trade?',
    a: 'A working tool, not a directory. You describe the kind of tour you are building in plain language, Atlas surfaces relevant independent operators from across its vetted network, and you assemble an ordered, attributed itinerary you can share or export. It is the same curated network behind the consumer Atlas — pointed at the people who build trips for a living.',
  },
  {
    q: 'Where do the operators come from?',
    a: 'The full Australian Atlas network: small-batch wineries and distillers, makers and studios, roasters, boutique stays, natural places, farm gates. Every listing is location-verified and contact-audited. The value to you is a defensible, pre-vetted set you can stand behind to a client — the independent layer the large platforms miss.',
  },
  {
    q: 'Is every operator bookable through Atlas?',
    a: 'No, and that is deliberate. Atlas is non-transactional. Some operators have told us they welcome trade enquiries and offer trade rates — where that is the case, the builder surfaces it so you can contact them directly. The rest show standard listing information. You always book direct with the operator.',
  },
  {
    q: 'Can I white-label the itineraries?',
    a: 'No. Itineraries carry a quiet "Curated via Atlas" line — it is a condition of use, not removable. You are welcome to present them to clients under your own trip; the attribution simply stays on the artefact.',
  },
  {
    q: 'What does it cost?',
    a: 'Nothing during the founding beta. Founding-cohort members lock in a founding rate at signup, with the first invoice aligned to the new financial year on 1 July — there is no charge while we are in beta, and you can step away at any time.',
  },
  {
    q: 'Who runs Australian Atlas?',
    a: 'Australian Atlas is independently operated and Australian-owned, part of the Australian Heritage editorial network. It is built and maintained by a small team focused on documenting independent Australia.',
  },
]

export default async function ForTradePage() {
  const stats = await getNetworkStats()

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Free founding beta banner */}
      <div style={{ background: 'var(--color-ink)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{
          maxWidth: 820, margin: '0 auto', padding: '14px 1.5rem',
          display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center',
          textAlign: 'center', flexWrap: 'wrap',
        }}>
          <span style={{
            flexShrink: 0,
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--color-ink)', background: 'var(--color-gold)',
            padding: '3px 10px', borderRadius: 99,
          }}>
            Free founding beta
          </span>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
            color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, margin: 0,
          }}>
            Atlas Trade is in free founding beta. A capped founding cohort gets full access at no cost while the product matures.
          </p>
        </div>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem 3.5rem', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-gold)', marginBottom: 12,
        }}>
          For the Travel Trade
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 44px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 16,
        }}>
          A vetted set of independent operators,<br />and a way to build with it
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: 580, margin: '0 auto',
        }}>
          Atlas Trade gives tour operators, DMCs, and trip designers a pre-vetted network of {stats.listings.toLocaleString()} independent
          Australian places — and a plain-language builder to assemble attributed itineraries from it.
        </p>
      </section>

      {/* What it is */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '0 1.5rem 4rem',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 32,
      }}>
        {[
          {
            title: 'A pre-vetted network',
            desc: `${stats.listings.toLocaleString()} independent operators across ${ATLAS_COUNT} categories and ${stats.regions} regions — location-verified, contact-audited, no paid placement. A defensible set you can stand behind to a client.`,
          },
          {
            title: 'Build in plain language',
            desc: 'Describe the tour — "a winery tour in the Yarra Valley" — and Atlas surfaces relevant operators from across the network. Add, swap, and reorder stops into an ordered itinerary.',
          },
          {
            title: 'Attributed, shareable, exportable',
            desc: 'Every itinerary carries a quiet "Curated via Atlas" line, shares on a private link, and exports to PDF. Present it to your client under your own trip — the curation stays credited.',
          },
        ].map((item) => (
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

      {/* The independence proposition */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-gold)', marginBottom: 12,
          }}>
            Why it holds up
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 24,
          }}>
            The independent layer is the reason people travel
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.7, margin: 0 }}>
              The cellar door that opened last year, the ceramicist working from a converted dairy, the
              roaster a town will drive an hour for — these are what an experienced traveller remembers, and
              what a good itinerary is built around. They are also the hardest to find reliably, because they
              rarely sit on the accredited registers.
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.7, margin: 0 }}>
              Atlas maps that layer systematically — verified, categorised, and placed within a real geography
              rather than a marketing label. For the trade, that is the value: a curated, defensible set you can
              assemble from quickly and stand behind to an international client, without vouching for places you
              have not checked yourself.
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.7, margin: 0 }}>
              Atlas stays non-transactional. You book direct with each operator. Where an operator has told us they
              welcome the trade, the builder surfaces that — trade rates, group ceilings, a note to contact them
              first — so the people who want your business are easy to reach, and the rest are simply good listings.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--color-gold)', marginBottom: 12,
          }}>
            The builder
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.25,
          }}>
            From a sentence to a shareable itinerary
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
          {[
            { n: '01', title: 'Describe the tour', desc: 'Plain language: a theme, a region, a feeling. No filters to wrangle.' },
            { n: '02', title: 'Review the candidates', desc: 'Atlas retrieves relevant operators from the whole network, ranked for the brief.' },
            { n: '03', title: 'Assemble the stops', desc: 'Add, swap, and reorder into an ordered itinerary. Search again for any gap.' },
            { n: '04', title: 'Share or export', desc: 'A private link and a PDF, both carrying the Atlas attribution.' },
          ].map((step) => (
            <div key={step.n} style={{
              padding: '24px', borderRadius: 12,
              border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--color-gold)', margin: '0 0 10px' }}>{step.n}</p>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 8 }}>
                {step.title}
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Beta access */}
      <section style={{
        background: 'white', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)', padding: '4rem 1.5rem',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--color-gold)', marginBottom: 12,
            }}>
              Founding beta
            </p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: 12 }}>
              Free while we&apos;re in beta
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: 600, margin: '0 auto' }}>
              The founding cohort is capped. Members get full access to the builder at no cost during beta, lock in a
              founding rate at signup, and would see their first invoice aligned to the financial year on 1 July. No card,
              no commitment — accepting the terms is the only step.
            </p>
          </div>

          <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-gold)', borderRadius: 14, padding: '28px', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--color-ink)', background: 'var(--color-gold)',
                padding: '4px 12px', borderRadius: 99,
              }}>
                Free during beta
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
                What founding members get
              </h3>
            </div>
            <ul style={{
              margin: 0, padding: 0, listStyle: 'none',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px 24px',
            }}>
              {[
                'The full natural-language itinerary builder',
                'The complete, verified independent-operator network',
                'Attributed, shareable itinerary links',
                'PDF export carrying the Atlas attribution',
                'Trade-welcome signals where operators have opted in',
                'A founding rate locked at signup',
              ].map((f, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                  color: 'var(--color-ink)', lineHeight: 1.5,
                }}>
                  <span style={{ color: 'var(--color-gold)', flexShrink: 0, marginTop: 2 }}>&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <Link href="/for-trade/apply" style={{
              display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
              color: 'var(--color-ink)', background: 'var(--color-gold)', padding: '14px 32px', borderRadius: 99,
              textDecoration: 'none',
            }}>
              Join the founding beta
            </Link>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '12px 0 0' }}>
              You&apos;ll sign in, tell us who you are, and accept the terms. That&apos;s the gate.
            </p>
          </div>

          <p style={{ textAlign: 'center', marginTop: 20, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>
            Already a member?{' '}
            <Link href="/trade/builder" style={{ color: 'var(--color-gold)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Open the builder
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.25 }}>
            Common questions
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{ padding: '20px 0', borderBottom: i < FAQ.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <h3 style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'var(--color-ink)', margin: '0 0 8px' }}>
                {item.q}
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.65, margin: 0 }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section style={{ background: 'var(--color-ink)', padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'white', lineHeight: 1.25, marginBottom: 16 }}>
            Talk to us first if you&apos;d rather
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, marginBottom: 28 }}>
            I&apos;m Matt, the founder of Australian Atlas. If you build trips for a living and want to understand
            whether the network fits the way you work, I&apos;d like to hear from you.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <a href="mailto:trade@australianatlas.com.au" style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'white', textDecoration: 'underline', textUnderlineOffset: 4 }}>
              trade@australianatlas.com.au
            </a>
            <Link href="/for-trade/apply" style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: 'var(--color-ink)', background: 'var(--color-gold)',
              padding: '10px 24px', borderRadius: 99, textDecoration: 'none',
            }}>
              Join the founding beta
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
