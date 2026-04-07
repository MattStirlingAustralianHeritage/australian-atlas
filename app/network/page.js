import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const metadata = {
  title: 'The Network — Australian Atlas',
  description: 'Live listing counts, recent additions, and coverage data across the nine-vertical Australian Atlas network.',
}

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

async function getNetworkData() {
  const sb = getSupabaseAdmin()
  try {
    // Total counts
    const { count: total } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active')
    const { count: regionCount } = await sb.from('regions').select('*', { count: 'exact', head: true })
    const { count: claimed } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_claimed', true)

    // Per-vertical counts
    const verticalCounts = {}
    for (const key of Object.keys(VERTICAL_NAMES)) {
      const { count } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('vertical', key).eq('status', 'active')
      verticalCounts[key] = count || 0
    }

    // Recently added (last 20)
    const { data: recent } = await sb
      .from('listings')
      .select('id, name, vertical, region, state, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20)

    // Added this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: addedThisWeek } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('created_at', weekAgo)

    // Region coverage: regions with at least one listing
    const { data: regionData } = await sb
      .from('regions')
      .select('name, slug, state, listing_count')
      .eq('status', 'live')
      .order('listing_count', { ascending: false })
      .limit(50)

    return {
      total: total || 0,
      regionCount: regionCount || 0,
      claimed: claimed || 0,
      verticalCounts,
      recent: recent || [],
      addedThisWeek: addedThisWeek || 0,
      regions: regionData || [],
    }
  } catch {
    return { total: 0, regionCount: 0, claimed: 0, verticalCounts: {}, recent: [], addedThisWeek: 0, regions: [] }
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default async function NetworkPage() {
  const data = await getNetworkData()

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ padding: '5rem 1.5rem 2rem', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          The Network
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '2.5rem',
          color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: '1rem',
        }}>
          A living atlas of independent Australia
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15,
          color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto',
        }}>
          Every number on this page is live. The network grows daily as venues are verified, claimed, and added across nine curated directories.
        </p>
      </section>

      {/* Live stats */}
      <section style={{ padding: '2rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16,
          padding: '32px', borderRadius: 12,
          background: 'var(--color-ink)', color: '#fff',
        }}>
          {[
            { n: data.total.toLocaleString(), label: 'Verified listings' },
            { n: '9', label: 'Curated atlases' },
            { n: String(data.regionCount), label: 'Mapped regions' },
            { n: data.claimed.toLocaleString(), label: 'Operator-claimed' },
            { n: `+${data.addedThisWeek}`, label: 'Added this week' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 32,
                color: '#fff', margin: 0, lineHeight: 1.1,
              }}>{s.n}</p>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11,
                color: 'rgba(255,255,255,0.5)', margin: '8px 0 0',
              }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Per-vertical breakdown */}
      <section style={{ padding: '2rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>
          By Atlas
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {Object.entries(VERTICAL_NAMES).map(([key, name]) => (
            <div key={key} style={{
              padding: '14px 18px', borderRadius: 8,
              border: '1px solid var(--color-border)', background: '#fff',
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-ink)' }}>{name}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13, color: 'var(--color-muted)' }}>{(data.verticalCounts[key] || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recently added */}
      <section style={{ padding: '2rem 1.5rem 3rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>
          Just added to the network
        </p>
        <div style={{ display: 'grid', gap: 6 }}>
          {data.recent.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderRadius: 6,
              border: '1px solid var(--color-border)', background: '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--color-sage)', minWidth: 80,
                }}>
                  {VERTICAL_NAMES[r.vertical] || r.vertical}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14,
                  color: 'var(--color-ink)',
                }}>
                  {r.name}
                </span>
                {r.region && (
                  <span style={{
                    fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
                    color: 'var(--color-muted)',
                  }}>
                    {r.region}, {r.state}
                  </span>
                )}
              </div>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11,
                color: 'var(--color-muted)', whiteSpace: 'nowrap',
              }}>
                {timeAgo(r.created_at)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Region coverage */}
      <section style={{ padding: '2rem 1.5rem 3rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 8,
        }}>
          Regional Coverage
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
          color: 'var(--color-muted)', marginBottom: 20, lineHeight: 1.5,
        }}>
          Regions sorted by listing density. Lighter counts show where the network is still growing.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {data.regions.map(r => (
            <Link
              key={r.slug}
              href={`/regions/${r.slug}`}
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 6,
                border: '1px solid var(--color-border)', background: '#fff',
                textDecoration: 'none',
              }}
            >
              <div>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-ink)' }}>{r.name}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11, color: 'var(--color-muted)', marginLeft: 6 }}>{r.state}</span>
              </div>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                color: 'var(--color-muted)',
                opacity: Math.max(0.3, Math.min(1, (r.listing_count || 0) / 200)),
              }}>
                {r.listing_count || 0}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Suggest a venue */}
      <section style={{ padding: '2rem 1.5rem 5rem', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          padding: '36px 28px', borderRadius: 12,
          background: 'var(--color-cream)', border: '1px solid var(--color-border)',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.5rem',
            color: 'var(--color-ink)', marginBottom: 8,
          }}>
            Know a place we have missed?
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
            color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 20,
            maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
          }}>
            The Atlas grows best through word of mouth. If you know an independent venue, maker, or natural place that should be on the network, tell us.
          </p>
          <a
            href="mailto:suggest@australianatlas.com.au?subject=Venue suggestion"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 6,
              background: 'var(--color-ink)', color: '#fff',
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Suggest a venue
          </a>
        </div>
      </section>
    </div>
  )
}
