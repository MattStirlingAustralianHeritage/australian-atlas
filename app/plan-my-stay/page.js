import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const revalidate = 1800

export const metadata = {
  title: 'Plan your stay — Australian Atlas',
  description: 'Pick where you\u2019re staying and we\u2019ll build day trips into the surrounding area. Every day starts and ends at your base.',
  alternates: { canonical: 'https://australianatlas.com.au/plan-my-stay' },
  openGraph: {
    title: 'Plan your stay — Australian Atlas',
    description: 'Pick where you\u2019re staying and we\u2019ll build day trips into the surrounding area. Every day starts and ends at your base.',
    url: 'https://australianatlas.com.au/plan-my-stay',
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
}

const GOLD = '#C4973B'
const PER_REGION = 4

async function getStaysByRegion() {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('listings')
    .select('id, name, slug, region, state, hero_image_url, is_featured')
    .eq('vertical', 'rest')
    .eq('status', 'active')
    .not('region', 'is', null)
    .not('lat', 'is', null)
    .order('is_featured', { ascending: false })
    .order('name', { ascending: true })
    .limit(500)

  const byRegion = new Map()
  for (const l of data || []) {
    if (!byRegion.has(l.region)) byRegion.set(l.region, [])
    const bucket = byRegion.get(l.region)
    if (bucket.length < PER_REGION) bucket.push(l)
  }

  return [...byRegion.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export default async function PlanMyStayPage() {
  const regions = await getStaysByRegion()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg, #faf8f5)' }}>
      <header style={{
        padding: '80px 24px 48px',
        textAlign: 'center',
        maxWidth: 720,
        margin: '0 auto',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--color-muted, #8a8a8a)',
          marginBottom: 16,
        }}>
          Stay-first trip planning
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(32px, 5vw, 52px)',
          fontWeight: 400,
          color: 'var(--color-ink, #1a1a1a)',
          lineHeight: 1.15,
          marginBottom: 16,
        }}>
          Plan your stay
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 17,
          lineHeight: 1.6,
          color: 'var(--color-muted, #8a8a8a)',
          maxWidth: 560,
          margin: '0 auto',
        }}>
          Pick where you&apos;re staying and we&apos;ll build day trips into the surrounding area. Every day starts and ends at your base.
        </p>
      </header>

      <main style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: '0 24px 96px',
      }}>
        {regions.length === 0 ? (
          <p style={{
            textAlign: 'center',
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--color-muted, #8a8a8a)',
            marginTop: 48,
          }}>
            No stays available yet. Check back soon.
          </p>
        ) : (
          regions.map(([region, stays]) => (
            <section key={region} style={{ marginBottom: 64 }}>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: 26,
                color: 'var(--color-ink, #1a1a1a)',
                marginBottom: 20,
                paddingBottom: 12,
                borderBottom: '1px solid var(--color-border, #e0ddd8)',
              }}>
                {region}
                {stays[0]?.state && (
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: GOLD,
                    marginLeft: 12,
                    verticalAlign: 'middle',
                  }}>
                    {stays[0].state}
                  </span>
                )}
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 16,
              }}>
                {stays.map(stay => (
                  <Link
                    key={stay.id}
                    href={`/place/${stay.slug}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      background: '#1B2631',
                      borderRadius: 12,
                      overflow: 'hidden',
                      textDecoration: 'none',
                      minHeight: 200,
                    }}
                  >
                    {stay.hero_image_url ? (
                      <div style={{ height: 140, overflow: 'hidden', background: '#0f1a22' }}>
                        <img
                          src={stay.hero_image_url}
                          alt=""
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ) : (
                      <div style={{ height: 140, background: '#0f1a22' }} />
                    )}
                    <div style={{
                      padding: '16px 18px',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}>
                      <h3 style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 400,
                        fontSize: 18,
                        color: '#FAF8F4',
                        lineHeight: 1.3,
                        margin: 0,
                      }}>
                        {stay.name}
                      </h3>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        fontWeight: 500,
                        color: GOLD,
                        marginTop: 12,
                      }}>
                        Plan from here &rarr;
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  )
}
