import LocalizedLink from '@/components/LocalizedLink'
import { STATE_OUTLINES, projectPoint } from '@/lib/regions/stateOutlines'

/**
 * Region card for the /regions and /explore indexes — server-rendered card
 * content (the LocalizedLink wrapper is the only client boundary).
 *
 * Replaces the per-card live Mapbox GL maps (RegionMapCard), which cost a
 * WebGL context each and rendered as blank dark boxes whenever GL was
 * unavailable, blocked, or exhausted. Here the cartography is an inline SVG
 * state silhouette with the region's centroid dot — self-contained, instant,
 * and it actually tells the reader where in the state the region sits.
 *
 * Props:
 *   region: { name (pre-localized), slug, state, listing_count, center_lat, center_lng }
 *   chips:  [{ key, label, count, color }] — top categories, already localized
 *   placeLabel: localized "113 places" string
 */
export default function RegionIndexCard({ region, chips = [], placeLabel }) {
  const outline = STATE_OUTLINES[region.state]
  const dot = outline ? projectPoint(region.state, region.center_lat, region.center_lng) : null

  // The silhouette renders at a fixed pixel height, so convert the desired
  // dot radius from px to viewBox units per state (their heights differ).
  const SVG_PX = 76
  const rUnit = outline ? outline.h / SVG_PX : 1

  return (
    <LocalizedLink
      href={`/regions/${region.slug}`}
      className="region-index-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '0.9rem',
        padding: '1.15rem 1.25rem 1.05rem',
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface, #faf6ee)',
        textDecoration: 'none',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem' }}>
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: '1.2rem',
              lineHeight: 1.25,
              color: 'var(--color-ink)',
              margin: '0 0 0.4rem',
            }}
          >
            {region.name}
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12.5px',
              fontWeight: 400,
              color: 'var(--color-muted)',
              margin: 0,
            }}
          >
            {placeLabel}
          </p>
        </div>

        {outline && (
          <svg
            viewBox={`0 0 ${outline.w} ${outline.h}`}
            style={{ height: `${SVG_PX}px`, width: 'auto', maxWidth: '96px', flexShrink: 0 }}
            aria-hidden="true"
          >
            <path
              d={outline.d}
              fill="rgba(184, 134, 43, 0.06)"
              stroke="rgba(62, 58, 51, 0.38)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
            {dot && (
              <>
                <circle cx={dot.x} cy={dot.y} r={7 * rUnit} fill="rgba(184, 134, 43, 0.25)" />
                <circle cx={dot.x} cy={dot.y} r={3.2 * rUnit} fill="#b8862b" />
              </>
            )}
          </svg>
        )}
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.9rem' }}>
          {chips.map(c => (
            <span
              key={c.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontFamily: 'var(--font-body)',
                fontSize: '11.5px',
                fontWeight: 500,
                color: 'var(--color-ink)',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: c.color, flexShrink: 0,
                }}
              />
              {c.label}
              <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>{c.count}</span>
            </span>
          ))}
        </div>
      )}
    </LocalizedLink>
  )
}
