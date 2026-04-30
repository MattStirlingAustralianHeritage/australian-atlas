import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

const VERTICAL_BG = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

export default async function TrailPreview({ params }) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return <div style={{ padding: 60, textAlign: 'center' }}>Sign in.</div>

  const { id } = await params
  const sb = getSupabaseAdmin()
  const { data: trail } = await sb.from('trails').select('*').eq('id', id).single()
  if (!trail) notFound()
  const { data: stops } = await sb.from('trail_stops')
    .select('*, listings!trail_stops_listing_id_fkey(slug, vertical, hero_image_url)')
    .eq('trail_id', id).order('position', { ascending: true })

  return (
    <div style={{ background: '#fafafa', minHeight: '100vh', paddingBottom: 60 }}>
      {/* Preview banner */}
      <div style={{ background: '#FCE4B8', color: '#7A5520', padding: '8px 16px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>
        PREVIEW — status: {trail.status} · this is an admin-only render of the trail data model. The public template lands in a later phase.
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '36px 24px' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 12 }}>
          Editorial trail
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4.5vw, 48px)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.1, marginBottom: 12 }}>
          {trail.title || <em style={{ color: 'var(--color-muted)' }}>Untitled</em>}
        </h1>

        {trail.subtitle && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 17, color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 24, fontStyle: 'italic' }}>
            {trail.subtitle}
          </p>
        )}

        {trail.hero_image_url && (
          <img src={trail.hero_image_url} alt={trail.hero_image_alt || ''} style={{ width: '100%', height: 360, objectFit: 'cover', borderRadius: 6, marginBottom: 24 }} />
        )}

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '12px 0', marginBottom: 32 }}>
          {trail.day_count != null && <span><strong style={{ color: 'var(--color-ink)' }}>{trail.day_count}</strong> day{trail.day_count > 1 ? 's' : ''}</span>}
          {trail.total_distance_km != null && <span><strong style={{ color: 'var(--color-ink)' }}>{Math.round(trail.total_distance_km)}</strong> km total</span>}
          {trail.total_duration_minutes != null && <span><strong style={{ color: 'var(--color-ink)' }}>{Math.floor(trail.total_duration_minutes / 60)}h {Math.round(trail.total_duration_minutes % 60)}m</strong> drive time</span>}
          {trail.season_window && <span>Best in <strong style={{ color: 'var(--color-ink)' }}>{trail.season_window}</strong></span>}
          {(trail.mood_tags || []).length > 0 && (
            <span>{trail.mood_tags.map(t => <em key={t} style={{ marginRight: 6 }}>{t}</em>)}</span>
          )}
        </div>

        {trail.intro && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, lineHeight: 1.7, color: 'var(--color-ink)', marginBottom: 36, whiteSpace: 'pre-wrap' }}>
            {trail.intro}
          </div>
        )}

        {/* Stops */}
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 16 }}>
            The route
          </h2>
          {(stops || []).map((s, i) => (
            <article key={s.id} style={{ paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--color-muted)', fontWeight: 400 }}>#{i + 1}</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
                  {s.venue_name}
                </h3>
                {s.vertical && (
                  <span style={{ background: VERTICAL_BG[s.vertical] + '20', color: VERTICAL_BG[s.vertical], padding: '2px 8px', borderRadius: 3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 9, fontFamily: 'var(--font-body)' }}>
                    {s.vertical}
                  </span>
                )}
                {s.is_overnight && <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>· overnight</span>}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', marginBottom: 10, display: 'flex', gap: 12 }}>
                {s.day_number != null && <span>Day {s.day_number}</span>}
                {s.distance_from_previous_km != null && i > 0 && <span>{Math.round(s.distance_from_previous_km)} km · {Math.round(s.duration_from_previous_minutes || 0)} min from previous</span>}
                {s.arrival_note && <em>{s.arrival_note}</em>}
              </div>
              {s.editorial_copy ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.7, color: 'var(--color-ink)', whiteSpace: 'pre-wrap' }}>
                  {s.editorial_copy}
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', fontStyle: 'italic' }}>(no editorial copy yet)</div>
              )}
            </article>
          ))}
        </div>

        {trail.outro && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, lineHeight: 1.7, color: 'var(--color-ink)', whiteSpace: 'pre-wrap', borderTop: '1px solid var(--color-border)', paddingTop: 24 }}>
            {trail.outro}
          </div>
        )}
      </div>
    </div>
  )
}
