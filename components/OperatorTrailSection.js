import { getVerticalBadge } from '@/lib/verticalUrl'

/**
 * OperatorTrailSection — renders an operator's published "suggested trail" on
 * their listing page (aggregator + vertical). Presentational only: pass the
 * resolved trail from readOperatorTrailForListing / getPortalListingTrail.
 *
 * Each stop links to the canonical aggregator place page so the links resolve
 * from either surface — pass `placeUrlBase` (e.g. the portal origin) on a
 * vertical site; leave it '' on the aggregator for same-origin relative links.
 *
 * Renders nothing if there's no trail or fewer than two stops.
 */
export default function OperatorTrailSection({ trail, operatorName, placeUrlBase = '' }) {
  if (!trail || !Array.isArray(trail.stops) || trail.stops.length < 2) return null

  const regionName = trail.region || null
  const placeHref = (slug) => `${placeUrlBase}/place/${slug}`

  return (
    <section
      className="mb-12"
      style={{
        background: 'linear-gradient(180deg, rgba(196,151,59,0.07) 0%, rgba(196,151,59,0.02) 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        padding: '1.75rem 1.85rem',
      }}
    >
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-gold)', margin: '0 0 0.6rem' }}>
        {regionName ? `A day out · ${regionName}` : 'A day out'}
      </p>

      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, lineHeight: 1.15, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
        {trail.title}
      </h2>

      {trail.intro ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.65, color: 'var(--color-ink)', opacity: 0.85, margin: '0 0 0.4rem', maxWidth: '46rem' }}>
          {trail.intro}
        </p>
      ) : null}

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '0 0 1.5rem' }}>
        Suggested by {operatorName}
      </p>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {trail.stops.map((s, i) => {
          const last = i === trail.stops.length - 1
          return (
            <li key={`${s.listing_id}-${i}`} style={{ display: 'flex', gap: '1rem' }}>
              {/* numbered spine */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
                <span style={{
                  width: 30, height: 30, borderRadius: '50%', background: 'var(--color-gold)', color: '#1C1A17',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{i + 1}</span>
                {!last && <span style={{ flex: 1, width: 2, background: 'rgba(196,151,59,0.35)', marginTop: 4, minHeight: 18 }} />}
              </div>

              {/* stop */}
              <div style={{ flex: 1, paddingBottom: last ? 0 : '1.1rem', minWidth: 0 }}>
                <a
                  href={placeHref(s.venue_slug)}
                  style={{ display: 'inline-block', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--color-ink)', textDecoration: 'none' }}
                >
                  {s.venue_name}
                </a>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                  {getVerticalBadge(s.vertical)}{s.sub_type ? ` · ${s.sub_type}` : ''}
                </div>
                {s.editorial_copy ? (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6, color: 'var(--color-ink)', opacity: 0.82, margin: '0.5rem 0 0', maxWidth: '42rem' }}>
                    {s.editorial_copy}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
