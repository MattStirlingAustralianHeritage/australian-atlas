import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalUrl, getVerticalBadge } from '@/lib/verticalUrl'
import TrailMap from './TrailMap'
import ShareButton from './ShareButton'

export const dynamic = 'force-dynamic'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const sb = getSupabaseAdmin()
  const { data: trail } = await sb
    .from('trails')
    .select('title, description')
    .eq('slug', slug)
    .eq('published', true)
    .single()
  if (!trail) return {}
  const description = trail.description || `A curated discovery trail — ${trail.title}.`
  return {
    title: `${trail.title} | Australian Atlas`,
    description,
    openGraph: {
      title: trail.title,
      description,
      url: `https://australianatlas.com.au/trails/${slug}`,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'article',
    },
    alternates: {
      canonical: `https://australianatlas.com.au/trails/${slug}`,
    },
  }
}

export default async function TrailPage({ params }) {
  const { slug } = await params
  const sb = getSupabaseAdmin()

  const { data: trail } = await sb
    .from('trails')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!trail) notFound()

  const { data: stops } = await sb
    .from('trail_stops')
    .select('*, listings(slug)')
    .eq('trail_id', trail.id)
    .order('order_index', { ascending: true })

  const validStops = (stops || []).filter(s => s.venue_lat && s.venue_lng)

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: '#0f0e0c', padding: '72px 24px 56px', borderBottom: '1px solid var(--color-border)', position: 'relative', overflow: 'hidden' }}>
        {/* Dot grid texture */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, #f0ece4 1px, transparent 1px)', backgroundSize: '16px 16px', opacity: 0.1, pointerEvents: 'none' }} />
        <div className="max-w-6xl mx-auto" style={{ position: 'relative' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 14, fontFamily: 'var(--font-body)' }}>
            {trail.region ? `${trail.region} · ` : ''}Discovery Trail
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 400, color: '#fff', lineHeight: 1.15, marginBottom: 16 }}>
            {trail.title}
          </h1>
          {trail.description && (
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: 620, fontFamily: 'var(--font-body)', marginBottom: 20 }}>
              {trail.description}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)', flexWrap: 'wrap' }}>
            <span>{validStops.length} stops</span>
            {trail.duration && <><span>·</span><span>{trail.duration}</span></>}
            {trail.curator_name && <><span>·</span><span>Curated by {trail.curator_name}</span></>}
            {trail.vertical_focus && (
              <>
                <span>·</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: VERTICAL_COLORS[trail.vertical_focus] || 'rgba(255,255,255,0.6)',
                }}>
                  {getVerticalBadge(trail.vertical_focus)}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Editorial intro prose */}
      {trail.type === 'editorial' && trail.hero_intro && (
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

          {/* Left: Stops */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {trail.curator_note && (
              <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-sage)', borderRadius: 3, padding: '20px 24px' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>Curator's note</div>
                <p style={{ fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.7, fontFamily: 'var(--font-body)' }}>{trail.curator_note}</p>
              </div>
            )}
            {validStops.map((stop, index) => (
              <StopCard key={stop.id} stop={stop} index={index} isLast={index === validStops.length - 1} />
            ))}
          </div>

          {/* Right: Sticky map */}
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
              { label: 'Duration', value: trail.duration || 'Full day', sub: 'Allow time between stops' },
              { label: 'Best visited', value: trail.best_season || 'Year round', sub: 'Check venue hours before going' },
              { label: 'Region', value: trail.region || 'Multiple regions', sub: 'A car is recommended' },
              { label: 'Stops', value: `${validStops.length} venues`, sub: 'Across multiple verticals' },
            ].map(item => (
              <div key={item.label} style={{ padding: '20px 24px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 3 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-ink)', marginBottom: 4 }}>{item.value}</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>{item.sub}</div>
              </div>
            ))}
          </div>

          {/* Share + nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24, padding: '32px 0', borderTop: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--color-ink)', marginBottom: 6 }}>Share this trail</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                Send the link to a friend or save it for later.
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

function StopCard({ stop, index, isLast }) {
  const verticalColor = VERTICAL_COLORS[stop.vertical] || 'var(--color-sage)'
  // Use the actual listing slug from the joined listings table
  const listingSlug = stop.listings?.slug || null
  const venueUrl = listingSlug ? `/place/${listingSlug}` : null

  return (
    <div style={{ display: 'flex', gap: 16, position: 'relative' }}>
      {/* Connecting line */}
      {!isLast && (
        <div style={{ position: 'absolute', left: 19, top: 48, width: 1, height: 'calc(100% + 8px)', background: 'var(--color-border)' }} />
      )}

      {/* Number badge */}
      <div style={{
        flexShrink: 0, width: 40, height: 40, borderRadius: '50%',
        background: verticalColor, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 14, zIndex: 1, marginTop: 4,
        fontFamily: 'var(--font-body)',
      }}>
        {index + 1}
      </div>

      {/* Card */}
      <div style={{ flex: 1, background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
        {/* Typographic venue card or real venue photo */}
        {stop.venue_image_url && !stop.venue_image_url.includes('unsplash.com') ? (
          <div style={{ aspectRatio: '16/7', overflow: 'hidden' }}>
            <img src={stop.venue_image_url} alt={stop.venue_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{
            aspectRatio: '16/7', overflow: 'hidden', position: 'relative',
            background: verticalColor ? `${verticalColor}` : '#0f0e0c',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            padding: '1rem', textAlign: 'center',
          }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '16px 16px', opacity: 0.08, pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ width: 20, height: 1, background: '#fff', opacity: 0.35, margin: '0 auto 0.5rem' }} />
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, color: '#fff', margin: 0, lineHeight: 1.3 }}>{stop.venue_name}</p>
            </div>
          </div>
        )}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            {venueUrl ? (
              <a href={venueUrl} style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--color-ink)', textDecoration: 'none' }}>
                {stop.venue_name}
              </a>
            ) : (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--color-ink)' }}>
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
            <p style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.65, fontFamily: 'var(--font-body)', borderTop: '1px solid var(--color-border)', paddingTop: 12, marginTop: 10 }}>
              {stop.notes}
            </p>
          )}
          {venueUrl && (
            <a href={venueUrl} style={{ display: 'inline-block', marginTop: 12, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-sage)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
              View listing →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
