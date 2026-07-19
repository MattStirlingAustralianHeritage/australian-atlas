import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalUrl, getVerticalBadge, VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import { DAY_COLORS } from '@/app/itinerary/engineShared'
import TrailMap from '../../trails/[slug]/TrailMap'
import ShareButton from '../../trails/[slug]/ShareButton'
import TrailLegCard from '@/components/TrailLegCard'
import GettingThereCard from '@/components/GettingThereCard'

export const dynamic = 'force-dynamic'

const VERTICAL_COLORS = VERTICAL_ACCENTS

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
  const t = await getTranslations('trails')
  const sb = getSupabaseAdmin()

  const { data: trail } = await sb
    .from('trails')
    .select('id, title, slug, short_code, description, type, region, hero_image_url, hero_intro, curator_name, duration_hours, best_season, transport_mode, neighbourhood_label, getting_there_origin')
    .eq('short_code', shortcode)
    .in('visibility', ['link', 'public'])
    .single()

  if (!trail) notFound()

  const { data: stops } = await sb
    .from('trail_stops')
    .select('id, trail_id, listing_id, vertical, venue_name, venue_lat, venue_lng, venue_image_url, position, day_number, editorial_copy, listings(slug)')
    .eq('trail_id', trail.id)
    .order('position', { ascending: true })

  const validStops = (stops || []).filter(s => s.venue_lat && s.venue_lng)

  // Itinerary Engine trips carry a day structure — group and number per day.
  const hasDays = validStops.some(s => (s.day_number || 1) > 1)
  const dayCounters = {}
  const numberedStops = validStops.map(s => {
    const day = s.day_number || 1
    dayCounters[day] = (dayCounters[day] || 0) + 1
    return { ...s, _day: day, _numInDay: dayCounters[day] }
  })

  const isEditorial = trail.type === 'editorial'

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: '#1c1a17', padding: '64px 24px 48px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
        {isEditorial && trail.hero_image_url && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src={trail.hero_image_url} alt={trail.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />
          </div>
        )}
        <div className="max-w-6xl mx-auto" style={{ position: 'relative' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 12, fontFamily: 'var(--font-body)' }}>
            {isEditorial ? t('editorialTrail') : t('communityTrail')}
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
            <span>{t('stopsCount', { count: validStops.length })}</span>
            {trail.transport_mode === 'transit' && (
              <><span>·</span><span style={{ color: 'var(--color-sage)' }}>{t('carFreeTrail')}</span></>
            )}
            {trail.transport_mode === 'neighbourhood' && (
              <><span>·</span><span style={{ color: '#5A8A9A' }}>{t('neighbourhoodWalk')}{trail.neighbourhood_label ? ` · ${trail.neighbourhood_label}` : ''}</span></>
            )}
            {trail.duration && <><span>·</span><span>{trail.duration}</span></>}
            {trail.curator_name && <><span>·</span><span>{t('curatedBy', { name: trail.curator_name })}</span></>}
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
            {/* Getting There card for neighbourhood trails */}
            {trail.transport_mode === 'neighbourhood' && validStops.length > 0 && (
              <GettingThereCard
                neighbourhoodLabel={trail.neighbourhood_label || null}
                firstStopLat={validStops[0].venue_lat}
                firstStopLng={validStops[0].venue_lng}
                customOrigin={trail.getting_there_origin || null}
                state={null}
              />
            )}
            {numberedStops.map((stop, i) => {
              const verticalColor = VERTICAL_COLORS[stop.vertical] || 'var(--color-sage)'
              const listingSlug = stop.listings?.slug || null
              const venueUrl = listingSlug ? `/place/${listingSlug}` : null
              const showDayHeader = hasDays && (i === 0 || numberedStops[i - 1]._day !== stop._day)
              const dayColor = DAY_COLORS[(stop._day - 1) % DAY_COLORS.length]

              return (
                <div key={stop.id}>
                {showDayHeader && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: i === 0 ? '0 0 16px' : '28px 0 16px' }}>
                    <span style={{ width: 11, height: 11, borderRadius: '50%', background: dayColor, flexShrink: 0 }} />
                    <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)' }}>
                      Day {stop._day}
                    </h2>
                    <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, position: 'relative' }}>
                  {i < numberedStops.length - 1 && (
                    <div style={{ position: 'absolute', left: 17, top: 40, width: 1, height: 'calc(100% + 8px)', background: 'var(--color-border)' }} />
                  )}
                  <div style={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                    background: verticalColor, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 13, marginTop: 2,
                    fontFamily: 'var(--font-body)', zIndex: 1,
                  }}>
                    {hasDays ? stop._numInDay : i + 1}
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
                      {stop.editorial_copy && (
                        <p style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.65, fontFamily: 'var(--font-body)', marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                          {stop.editorial_copy}
                        </p>
                      )}
                      {venueUrl && (
                        <a href={venueUrl} style={{ display: 'inline-block', marginTop: 10, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-sage)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                          {t('viewListing')} →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {/* Walking leg card for no-car modes */}
                {trail.transport_mode && trail.transport_mode !== 'drive' && i < validStops.length - 1 && (
                  <div style={{ margin: '8px 0 0 0' }}>
                    <TrailLegCard
                      fromLat={stop.venue_lat}
                      fromLng={stop.venue_lng}
                      toLat={validStops[i + 1].venue_lat}
                      toLng={validStops[i + 1].venue_lng}
                    />
                  </div>
                )}
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
            {t('planYourVisit')}
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 400, color: 'var(--color-ink)', marginBottom: 36, lineHeight: 1.2 }}>
            {t('whatToKnow')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, marginBottom: 48 }}>
            {[
              { label: t('infoStops'), value: t('venuesCount', { count: validStops.length }), sub: t('allIndependent') },
              { label: t('infoDuration'), value: trail.duration || t('allowFullDay'), sub: t('adjustPace') },
              { label: t('infoGettingThere'), value: trail.transport_mode === 'neighbourhood' ? t('gettingThereWalk') : trail.transport_mode === 'transit' ? t('gettingThereTransit') : t('gettingThereCar'), sub: trail.transport_mode === 'neighbourhood' ? t('allStopsWalkable') : t('checkVenueHours') },
              { label: t('infoBestVisited'), value: trail.best_season || t('yearRound'), sub: t('weatherVaries') },
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
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--color-ink)', marginBottom: 6 }}>{t('buildYourOwn')}</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                {t('buildYourOwnLine1')}<br />
                {t('buildYourOwnLine2')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <ShareButton shortCode={trail.short_code} slug={trail.slug} />
              <Link href="/trails" style={{ display: 'inline-block', padding: '11px 24px', border: '1px solid var(--color-border)', color: 'var(--color-muted)', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 2 }}>
                {t('allTrails')}
              </Link>
              <Link href="/trails/builder" style={{ display: 'inline-block', padding: '11px 24px', background: 'var(--color-sage)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 2 }}>
                {t('buildATrail')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
