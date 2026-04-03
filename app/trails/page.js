import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalBadge } from '@/lib/verticalUrl'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Discovery Trails | Australian Atlas',
  description: 'Curated trails connecting the best independent places across Australia — crossing wineries, galleries, makers, stays, and more.',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

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

      {/* Hero */}
      <div style={{ background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-6xl mx-auto px-6" style={{ padding: '64px 24px' }}>
          <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 12, fontFamily: 'var(--font-body)', fontWeight: 600 }}>Discovery Trails</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 400, color: 'var(--color-ink)', marginBottom: 12, lineHeight: 1.2 }}>
            Curated routes across Australia
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 15, lineHeight: 1.6, maxWidth: 520, fontFamily: 'var(--font-body)' }}>
            Trails that connect independent places across verticals — from wineries to galleries, makers to natural wonders. Follow an editorial route or build your own.
          </p>
        </div>
      </div>

      {/* Editorial Trails */}
      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 4 }}>Editorial Trails</p>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
              {(editorialTrails || []).length} curated trail{(editorialTrails || []).length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {(!editorialTrails || editorialTrails.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
            No editorial trails yet — check back soon.
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

      {/* Build CTA */}
      <div className="max-w-6xl mx-auto px-6" style={{ padding: '56px 24px 80px' }}>
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--color-ink)', marginBottom: 8 }}>Build your own trail</div>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.5, maxWidth: 420 }}>
              Plan a custom route across any of the nine Atlas verticals. Save it, share it, and explore Australia your way.
            </p>
          </div>
          <Link
            href="/trails/builder"
            style={{
              display: 'inline-block', padding: '12px 28px',
              background: 'var(--color-sage)', color: '#fff',
              textDecoration: 'none', fontSize: 12, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'var(--font-body)', borderRadius: 3,
            }}
          >
            Build a trail
          </Link>
        </div>
      </div>
    </div>
  )
}

function EditorialTrailCard({ trail }) {
  return (
    <Link href={`/trails/${trail.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{ background: 'var(--color-card-bg)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border)', transition: 'border-color 0.2s' }}>
        <div style={{ aspectRatio: '16/9', background: 'var(--color-cream)', overflow: 'hidden' }}>
          {trail.cover_image_url ? (
            <img src={trail.cover_image_url} alt={trail.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--color-cream), #e8ddd0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trail</span>
            </div>
          )}
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
