import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { regionFactSheet, computeStorySignals, PRESS_VERTICALS, verticalName } from '@/lib/press/insights'

// A public, live example of what the Newsroom serves: the fact sheet for a
// real region (the busiest one), plus any story signals it's generating.
// Server-rendered fresh — the same numbers a member would see.

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Example fact sheet — Australian Atlas Newsroom',
  description: 'A live example of the citable regional data the Australian Atlas Newsroom gives working press.',
}

function fmt(ymd) {
  if (!ymd) return ''
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function NewsroomExamplePage() {
  const sb = getSupabaseAdmin()

  const { data: regions } = await sb
    .from('regions')
    .select('id, slug, name, state, listing_count')
    .eq('status', 'live')
    .order('listing_count', { ascending: false })
    .limit(1)
  const region = regions?.[0]

  let fs = null
  let signals = []
  if (region) {
    fs = await regionFactSheet(sb, region)
    try {
      signals = await computeStorySignals(sb, [region])
    } catch { /* signals are a bonus — the fact sheet stands alone */ }
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '4rem 1.5rem 5rem' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12, textAlign: 'center',
        }}>
          Newsroom · Example fact sheet
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 40px)',
          fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15,
          marginBottom: 12, textAlign: 'center',
        }}>
          {region ? region.name : 'A region'}, on the record
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 auto 2.5rem',
          maxWidth: 560, textAlign: 'center',
        }}>
          This is a live example of the per-region data every Newsroom member gets — computed from the
          atlas just now{fs ? `, current as of ${fmt(fs.asOf)}` : ''}. Members see this for every region
          they follow, plus events, story leads and downloads.
        </p>

        {!fs ? (
          <p style={{ fontFamily: 'var(--font-body)', textAlign: 'center', color: 'var(--color-muted)' }}>
            No live regions yet — check back soon.
          </p>
        ) : (
          <>
            {/* Stat band */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
              {[
                ['Independent places', fs.total],
                ['Added, 30 days', fs.new30],
                ['Added, 90 days', fs.new90],
                ['Upcoming events', fs.upcomingEvents],
                ['Owner-claimed', fs.claimed],
              ].map(([label, value]) => (
                <div key={label} style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem 1.1rem' }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--color-ink)', margin: '0 0 2px' }}>{value}</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: 0 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Vertical split */}
            <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1.3rem 1.4rem', marginBottom: 24 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: '0 0 0.8rem' }}>
                What&apos;s here
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.4rem 1.5rem' }}>
                {PRESS_VERTICALS.filter(k => fs.byVertical[k] > 0).map(k => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)' }}>{verticalName(k)}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--color-ink)' }}>{fs.byVertical[k]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Signals */}
            {signals.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 0.8rem' }}>
                  Story signals this region is generating right now
                </p>
                <div style={{ display: 'grid', gap: 12 }}>
                  {signals.slice(0, 3).map((s, i) => (
                    <div key={i} style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem 1.15rem' }}>
                      <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)', lineHeight: 1.3, margin: '0 0 0.3rem' }}>{s.headline}</p>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.55, margin: 0 }}>{s.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Latest additions */}
            {fs.recentAdditions.length > 0 && (
              <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1.3rem 1.4rem', marginBottom: 32 }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: '0 0 0.8rem' }}>
                  Latest additions
                </p>
                {fs.recentAdditions.map((l, i) => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.45rem 0', borderBottom: i < fs.recentAdditions.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)' }}>
                      {l.name}{l.suburb ? <span style={{ color: 'var(--color-muted)', fontWeight: 300 }}> — {l.suburb}</span> : ''}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', flexShrink: 0 }}>{verticalName(l.vertical)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* CTA */}
        <div style={{ textAlign: 'center', background: 'var(--color-ink)', borderRadius: 14, padding: '2.2rem 1.6rem' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#faf8f5', margin: '0 0 6px' }}>
            Every region. Every event. Your inbox.
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 300, color: 'rgba(250,248,245,0.75)', lineHeight: 1.6, margin: '0 auto 1.2rem', maxWidth: 440 }}>
            The Newsroom is free for working press — from a one-person newsletter to a national masthead.
          </p>
          <Link
            href="/newsroom/enquire"
            style={{
              display: 'inline-block', background: 'var(--color-sage)', color: '#fff',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
              borderRadius: 99, padding: '0.7rem 1.8rem', textDecoration: 'none',
            }}
          >
            Request access
          </Link>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(250,248,245,0.55)', margin: '0.9rem 0 0' }}>
            Cite anything on this page: &ldquo;Source: Australian Atlas&rdquo;.
          </p>
        </div>
      </section>
    </div>
  )
}
