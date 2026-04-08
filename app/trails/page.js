import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalBadge } from '@/lib/verticalUrl'
import TrailPromptInput from '@/components/TrailPromptInput'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Discovery Trails | Australian Atlas',
  description: 'Curated trails connecting the best independent places across Australia — crossing wineries, galleries, makers, stays, and more.',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const EXAMPLE_TRAILS = [
  { query: 'Weekend wine trail through the Barossa', region: 'Barossa Valley, SA', days: '2 days', stops: '8 stops', verticals: ['Small Batch', 'Table', 'Rest'] },
  { query: 'Three day art and makers tour of Hobart', region: 'Hobart, TAS', days: '3 days', stops: '12 stops', verticals: ['Culture', 'Craft', 'Fine Grounds'] },
  { query: 'Day trip to Mornington Peninsula wineries', region: 'Mornington Peninsula, VIC', days: '1 day', stops: '5 stops', verticals: ['Small Batch', 'Table'] },
  { query: 'Byron hinterland long weekend with farm stays', region: 'Byron Hinterland, NSW', days: '3 days', stops: '10 stops', verticals: ['Rest', 'Table', 'Field'] },
  { query: 'Yarra Valley brewery and distillery day', region: 'Yarra Valley, VIC', days: '1 day', stops: '4 stops', verticals: ['Small Batch'] },
  { query: 'Adelaide Hills coffee and makers trail', region: 'Adelaide Hills, SA', days: '1 day', stops: '5 stops', verticals: ['Fine Grounds', 'Craft', 'Corner'] },
]

export default async function TrailsPage() {
  const sb = getSupabaseAdmin()

  // Editorial trails — published, pinned at top
  const { data: editorialTrails } = await sb
    .from('trails')
    .select('id, title, slug, description, cover_image_url, curator_name, region, vertical_focus, stop_count')
    .eq('type', 'editorial')
    .eq('published', true)
    .order('created_at', { ascending: false })

  // Community trails — public user trails, newest first
  const { data: communityTrails } = await sb
    .from('trails')
    .select('id, title, slug, short_code, description, region, vertical_focus, stop_count, created_at')
    .eq('type', 'user')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(12)

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero with prompt */}
      <div style={{ background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-4xl mx-auto text-center" style={{ padding: '64px 24px 56px' }}>
          <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 12, fontFamily: 'var(--font-body)', fontWeight: 600 }}>Discovery Trails</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 400, color: 'var(--color-ink)', marginBottom: 12, lineHeight: 1.2 }}>
            Plan a trip in plain English
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 15, lineHeight: 1.6, maxWidth: 520, margin: '0 auto', fontFamily: 'var(--font-body)' }}>
            Describe the trip you want — a region, a theme, a duration — and we&apos;ll build a day-by-day itinerary from real, verified venues across all nine atlases. Or build your own trail from scratch.
          </p>

          <TrailPromptInput />

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href="/trails/builder"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', color: 'var(--color-sage)', textDecoration: 'none' }}
            >
              Or build manually &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Example trails grid */}
      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 48 }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 4 }}>Try Something Like</p>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>Click any example to generate it instantly</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {EXAMPLE_TRAILS.map((example, i) => (
            <Link
              key={i}
              href={`/itinerary?q=${encodeURIComponent(example.query)}`}
              style={{ textDecoration: 'none', display: 'block', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '20px 22px', transition: 'border-color 0.2s, box-shadow 0.2s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--color-sage)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px', color: 'var(--color-sage)' }}>{example.region}</span>
                <span style={{ color: 'var(--color-border)', fontSize: 10 }}>&middot;</span>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '11px', color: 'var(--color-muted)' }}>{example.days}</span>
              </div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '17px', color: 'var(--color-ink)', lineHeight: 1.35, marginBottom: 12 }}>
                {example.query}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {example.verticals.map(v => (
                  <span key={v} style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '10px', color: 'var(--color-muted)', background: 'var(--color-cream)', padding: '2px 8px', borderRadius: 100 }}>{v}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Editorial Trails */}
      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 4 }}>Editorial Trails</p>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
              Hand-curated by our editors
            </p>
          </div>
        </div>

        {(!editorialTrails || editorialTrails.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
            Editorial trails coming soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 24 }}>
            {editorialTrails.map(trail => (
              <EditorialTrailCard key={trail.id} trail={trail} />
            ))}
          </div>
        )}
      </div>

      {/* Community Trails */}
      {communityTrails && communityTrails.length > 0 && (
        <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 48 }}>
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 4 }}>Community Trails</p>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>Built by readers</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {communityTrails.map(trail => {
              const href = trail.short_code ? `/t/${trail.short_code}` : `/trails/${trail.slug}`
              return (
                <Link key={trail.id} href={href} style={{ textDecoration: 'none', display: 'block', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)', lineHeight: 1.3 }}>{trail.title}</div>
                    {trail.vertical_focus && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: VERTICAL_COLORS[trail.vertical_focus] || 'var(--color-muted)',
                        fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', marginTop: 3,
                        background: `${VERTICAL_COLORS[trail.vertical_focus] || 'var(--color-muted)'}15`,
                        padding: '2px 8px', borderRadius: 3,
                      }}>
                        {getVerticalBadge(trail.vertical_focus)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                    <span>{trail.stop_count || 0} stop{(trail.stop_count || 0) !== 1 ? 's' : ''}</span>
                    {trail.region && <><span style={{ color: 'var(--color-border)' }}>·</span><span>{trail.region}</span></>}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="max-w-6xl mx-auto px-6" style={{ padding: '56px 24px 80px' }}>
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 48 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <p style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 8 }}>How It Works</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32, maxWidth: 800, margin: '0 auto' }}>
            {[
              { step: '01', title: 'Describe your trip', desc: 'Tell us where, when, and what you love — wineries, makers, nature, coffee, or all of the above.' },
              { step: '02', title: 'We build the itinerary', desc: 'Our engine pulls from thousands of verified listings across nine atlases to create a day-by-day plan.' },
              { step: '03', title: 'Explore and customise', desc: 'Add stops, swap venues, save to your account, and share with friends.' },
            ].map(item => (
              <div key={item.step} style={{ textAlign: 'center' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-sage)', opacity: 0.4, fontWeight: 400 }}>{item.step}</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--color-ink)', marginTop: 8, marginBottom: 8 }}>{item.title}</h3>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6, fontWeight: 300 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function EditorialTrailCard({ trail }) {
  return (
    <Link href={`/trails/${trail.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{ background: 'var(--color-card-bg)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border)', transition: 'border-color 0.2s' }}>
        <div style={{
          aspectRatio: '16/9', overflow: 'hidden', position: 'relative',
          background: '#0f0e0c', color: '#f0ece4',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          padding: '1.5rem 1.25rem', textAlign: 'center',
        }}>
          {/* Dot grid */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, #f0ece4 1px, transparent 1px)', backgroundSize: '16px 16px', opacity: 0.1, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 8, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.55, margin: '0 0 1rem' }}>DISCOVERY TRAIL</p>
            <div style={{ width: 20, height: 1, background: '#f0ece4', opacity: 0.35, margin: '0 auto 0.75rem' }} />
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, margin: 0, lineHeight: 1.3 }}>{trail.title}</p>
            {trail.region && <p style={{ fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 400, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.45, margin: '1rem 0 0' }}>{trail.region.toUpperCase()}</p>}
          </div>
        </div>
        <div style={{ padding: '20px 22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {trail.region && (
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)' }}>{trail.region}</span>
            )}
            {trail.region && <span style={{ color: 'var(--color-border)', fontSize: 10 }}>·</span>}
            <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>{trail.stop_count || 0} {(trail.stop_count || 0) === 1 ? 'stop' : 'stops'}</span>
            {trail.vertical_focus && (
              <>
                <span style={{ color: 'var(--color-border)', fontSize: 10 }}>·</span>
                <span style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: VERTICAL_COLORS[trail.vertical_focus] || 'var(--color-muted)',
                  fontFamily: 'var(--font-body)',
                  background: `${VERTICAL_COLORS[trail.vertical_focus] || 'var(--color-muted)'}15`,
                  padding: '2px 8px', borderRadius: 3,
                }}>
                  {getVerticalBadge(trail.vertical_focus)}
                </span>
              </>
            )}
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 8, lineHeight: 1.3 }}>{trail.title}</h2>
          {trail.description && (
            <p style={{
              fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.65, fontFamily: 'var(--font-body)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{trail.description}</p>
          )}
          {trail.curator_name && (
            <p style={{ marginTop: 12, fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>Curated by {trail.curator_name}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
