'use client'

/**
 * TrailLegCard — compact walking leg card between trail stops.
 *
 * Shows walking distance + estimated time. If the leg is over 2km,
 * flags it and provides a Google Maps transit directions link.
 *
 * Props:
 *   fromLat, fromLng — origin coordinates
 *   toLat, toLng — destination coordinates
 *   compact — if true, renders inline (builder mode)
 */

const WALK_SPEED_KMH = 4.8 // average urban walking speed

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${(Math.round(km * 10) / 10).toFixed(1)}km`
}

function formatWalkTime(km) {
  const minutes = Math.round((km / WALK_SPEED_KMH) * 60)
  if (minutes < 1) return '1 min walk'
  return `${minutes} min walk`
}

function transitUrl(fromLat, fromLng, toLat, toLng) {
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=transit`
}

export default function TrailLegCard({ fromLat, fromLng, toLat, toLng, compact = false }) {
  if (!fromLat || !fromLng || !toLat || !toLng) return null

  const distKm = haversineKm(fromLat, fromLng, toLat, toLng)
  // Walking routes are ~1.3x straight-line distance in urban areas
  const walkKm = distKm * 1.3
  const isFar = walkKm > 2
  const walkTimeStr = formatWalkTime(walkKm)
  const walkDistStr = formatDistance(walkKm)

  if (compact) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: '6px 12px', margin: '2px 0 2px 32px',
        background: isFar ? 'rgba(196,154,60,0.06)' : 'transparent',
        borderRadius: 4, borderLeft: isFar ? '2px solid #C49A3C' : '2px solid var(--color-border)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)',
        }}>
          <WalkIcon size={12} />
          <span>{walkTimeStr} · {walkDistStr}</span>
        </div>
        {isFar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#C49A3C' }}>
              A bit far to walk
            </span>
            <a
              href={transitUrl(fromLat, fromLng, toLat, toLng)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                color: 'var(--color-sage)', textDecoration: 'none',
              }}
            >
              Get transit directions →
            </a>
          </div>
        )}
      </div>
    )
  }

  // Full card mode — used on shared trail pages
  return (
    <div style={{
      margin: '0 0 0 19px', padding: isFar ? '12px 16px' : '8px 16px',
      background: isFar ? 'rgba(196,154,60,0.04)' : 'var(--color-card-bg)',
      border: `1px solid ${isFar ? 'rgba(196,154,60,0.2)' : 'var(--color-border)'}`,
      borderRadius: 3, position: 'relative',
    }}>
      {/* Connecting vertical line stub */}
      <div style={{
        position: 'absolute', left: -1, top: -1, width: 1, height: 'calc(100% + 2px)',
        background: 'var(--color-border)',
      }} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
      }}>
        <WalkIcon size={14} />
        <span>{walkTimeStr} · {walkDistStr}</span>
      </div>

      {isFar && (
        <div style={{ marginTop: 6 }}>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 12, color: '#C49A3C',
            marginBottom: 4,
          }}>
            A bit far to walk
          </div>
          <a
            href={transitUrl(fromLat, fromLng, toLat, toLng)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              color: 'var(--color-sage)', textDecoration: 'none',
            }}
          >
            Get transit directions →
          </a>
        </div>
      )}
    </div>
  )
}

function WalkIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <path d="M10 22V18L7 15V10l3-3h4l3 3v5l-3 3v4" />
    </svg>
  )
}

// Export utilities for use in other components
export { haversineKm, transitUrl, formatDistance, formatWalkTime, WALK_SPEED_KMH }
