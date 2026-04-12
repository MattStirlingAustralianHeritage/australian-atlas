import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalUrl, getVerticalBadge } from '@/lib/verticalUrl'
import TrailMap from '../../trails/[slug]/TrailMap'
import ShareButton from '../../trails/[slug]/ShareButton'

export const dynamic = 'force-dynamic'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

export async function generateMetadata({ params }) {
  const { shortcode } = await params
  const sb = getSupabaseAdmin()
  const { data: trail } = await sb
    .from('trails')
    .select('title, description')
    .eq('short_code', shortcode)
    .in('visibility', ['link', 'public'])
    .single()
  if (!trail) return {}
  return {
    title: `${trail.title} | Australian Atlas`,
    description: trail.description || `A discovery trail on Australian Atlas.`,
  }
}

export default async function SharedTrailPage({ params }) {
  const { shortcode } = await params
  const sb = getSupabaseAdmin()

  const { data: trail } = await sb
    .from('trails')
    .select('id, title, slug, short_code, description, type, region, cover_image_url, hero_intro, curator_name, duration, best_season')
    .eq('short_code', shortcode)
    .in('visibility', ['link', 'public'])
    .single()

  if (!trail) notFound()

  const { data: stops } = await sb
    .from('trail_stops')
    .select('id, trail_id, listing_id, vertical, venue_name, venue_lat, venue_lng, venue_image_url, order_index, day, notes, listings(slug)')
    .eq('trail_id', trail.id)
    .order('order_index', { ascending: true })

  const validStops = (stops || []).filter(s => s.venue_lat && s.venue_lng)

  const isEditorial = trail.type === 'editorial'

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: '#1c1a17', padding: '64px 24px 48px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
        {isEditorial && trail.cover_image_url && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src={trail.cover_image_url} alt={trail.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />
          </div>
        )}
        <div className="max-w-6xl mx-auto" style={{ position: 'relative' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 12, fontFamily: 'var(--font-body)' }}>
            {isEditorial ? 'Editorial trail' : 'Community trail'}
            {trail.region ? ` · ${trail.region}` : ''}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 400, color: '#fff', lineHeight: 1.15, marginBottom: 16 }}>
            {trail.title}
          </h1>
          {trail.description && (
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, fontFamily: 'var(--font-body)', marginBottom: 20, maxWidth: 560 }}>
              {trail.description}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)', flexWrap: 'wrap' }}>
            <span>{validStops.length} stops</span>
            {trail.duration && <><span>·</span><span>{trail.duration}</span></>}
            {trail.curator_name && <><span>·</span><span>Curated by {trail.curator_name}</span></>}
          </div>
        </div>
      </section>

      {/* Editorial intro */}
      {isEditorial && trail.hero_intro && (
        <section style={{ background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="max-w-3xl mx-auto px-6" style={{ padding: '48px 24px' }}>
            <p style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(17px, 2.5vw, 20px)', fontWeight: 400,
              color: 'var(--color-ink)', lineHeight: 1.75, fontStyle: 'italic',
            }}>
              {trail.hero_intro}
            </p>
          </div>
        </section>
      )}

      {/* Two-column body */}
      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 48 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 48, alignItems: 'start' }}>

          {/* Stops */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {validStops.map((stop, i) => {
              const verticalColor = VERTICAL_COLORS[stop.vertical] || 'var(--color-sage)'
              const listingSlug = stop.listings?.slug || null
              const venueUrl = listingSlug ? `/place/${listingSlug}` : null

              return (
                <div key={stop.id} style={{ display: 'flex', gap: 16, position: 'relative' }}>
                  {i < validStops.length - 1 && (
                    <div style={{ position: 'absolute', left: 17, top: 40, width: 1, height: 'calc(100% + 8px)', background: 'var(--color-border)' }} />
                  )}
                  <div style={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                    background: verticalColor, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 13, marginTop: 2,
                    fontFamily: 'var(--font-body)', zIndex: 1,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                    {stop.venue_image_url && (
                      <div style={{ aspectRatio: '16/6', overflow: 'hidden' }}>
                        <img src={stop.venue_image_url} alt={stop.venue_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        {venueUrl ? (
                          <a href={venueUrl} style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-ink)', textDecoration: 'none' }}>
                            {stop.venue_name}
                          </a>
                        ) : (
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-ink)' }}>
                            {stop.venue_name}
                          </span>
                        )}
                        {stop.vertical && (
                          <span style={{
                            fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                            fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', marginTop: 4, fontWeight: 600,
                            color: verticalColor,
                            background: `${verticalColor}15`,
                            padding: '2px 8px', borderRadius: 3,
                          }}>
                            {getVerticalBadge(stop.vertical)}
                          </span>
                        )}
                      </div>
                      {stop.notes && (
                        <p style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.65, fontFamily: 'var(--font-body)', marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                          {stop.notes}
                        </p>
                      )}
                      {venueUrl && (
                        <a href={venueUrl} style={{ display: 'inline-block', marginTop: 10, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-sage)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                          View listing →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Map */}
          <div style={{ position: 'sticky', top: 72 }}>
            <TrailMap stops={validStops} />
          </div>
        </div>
      </div>

      {/* Plan your visit */}
      <section className="max-w-6xl mx-auto px-6" style={{ padding: '56px 24px 80px' }}>
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 48 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 12, fontFamily: 'var(--font-body)' }}>
            Plan your visit
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 400, color: 'var(--color-ink)', marginBottom: 36, lineHeight: 1.2 }}>
            What to know before you go
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, marginBottom: 48 }}>
            {[
              { label: 'Stops', value: `${validStops.length} venues`, sub: 'All independently operated' },
              { label: 'Duration', value: trail.duration || 'Allow a full day', sub: 'Adjust pace between stops' },
              { label: 'Getting there', value: 'Car recommended', sub: 'Check venue hours before going' },
              { label: 'Best visited', value: trail.best_season || 'Year round', sub: 'Weather varies by region' },
            ].map(item => (
              <div key={item.label} style={{ padding: '20px 24px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 3 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-ink)', marginBottom: 4 }}>{item.value}</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>{item.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24, padding: '32px 0', borderTop: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--color-ink)', marginBottom: 6 }}>Build your own trail</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                Plan a custom route across Australia's best independent places.<br />
                Save and share with anyone.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <ShareButton shortCode={trail.short_code} slug={trail.slug} />
              <Link href="/trails" style={{ display: 'inline-block', padding: '11px 24px', border: '1px solid var(--color-border)', color: 'var(--color-muted)', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 2 }}>
                All Trails
              </Link>
              <Link href="/trails/builder" style={{ display: 'inline-block', padding: '11px 24px', background: 'var(--color-sage)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 2 }}>
                Build a trail
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
