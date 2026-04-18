'use client'

/**
 * GettingThereCard — pinned above the first stop in neighbourhood trail mode.
 *
 * Shows a transit link from the nearest CBD to the first stop's coordinates.
 *
 * Props:
 *   neighbourhoodLabel — e.g. "Fitzroy & Collingwood"
 *   firstStopLat, firstStopLng — coordinates of the first stop
 *   customOrigin — optional { lat, lng } override for the CBD origin
 *   state — state string to auto-detect the nearest capital
 */

// Australian capital CBD coordinates
const CBD_COORDS = {
  VIC: { lat: -37.8136, lng: 144.9631, name: 'Melbourne' },
  NSW: { lat: -33.8688, lng: 151.2093, name: 'Sydney' },
  QLD: { lat: -27.4705, lng: 153.0260, name: 'Brisbane' },
  SA:  { lat: -34.9285, lng: 138.6007, name: 'Adelaide' },
  WA:  { lat: -31.9505, lng: 115.8605, name: 'Perth' },
  TAS: { lat: -42.8821, lng: 147.3272, name: 'Hobart' },
  ACT: { lat: -35.2809, lng: 149.1300, name: 'Canberra' },
  NT:  { lat: -12.4634, lng: 130.8456, name: 'Darwin' },
}

// State name variants → key
const STATE_MAP = {
  'victoria': 'VIC', 'vic': 'VIC',
  'new south wales': 'NSW', 'nsw': 'NSW',
  'queensland': 'QLD', 'qld': 'QLD',
  'south australia': 'SA', 'sa': 'SA',
  'western australia': 'WA', 'wa': 'WA',
  'tasmania': 'TAS', 'tas': 'TAS',
  'australian capital territory': 'ACT', 'act': 'ACT',
  'northern territory': 'NT', 'nt': 'NT',
}

function resolveOrigin(state, customOrigin) {
  if (customOrigin && customOrigin.lat && customOrigin.lng) {
    return customOrigin
  }

  if (state) {
    const key = STATE_MAP[state.toLowerCase().trim()] || state.toUpperCase().trim()
    const cbd = CBD_COORDS[key]
    if (cbd) return cbd
  }

  // Default to Melbourne
  return CBD_COORDS.VIC
}

function transitUrl(fromLat, fromLng, toLat, toLng) {
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=transit`
}

export default function GettingThereCard({
  neighbourhoodLabel,
  firstStopLat,
  firstStopLng,
  customOrigin = null,
  state = null,
  compact = false,
}) {
  if (!firstStopLat || !firstStopLng) return null

  const origin = resolveOrigin(state, customOrigin)
  const heading = neighbourhoodLabel
    ? `Getting to ${neighbourhoodLabel}`
    : 'Getting to your first stop'
  const cityName = origin.name || 'the city'

  if (compact) {
    // Builder preview mode
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', margin: '0 0 6px 0',
        background: 'rgba(90, 138, 154, 0.06)',
        border: '1px solid rgba(90, 138, 154, 0.15)',
        borderRadius: 4,
      }}>
        <TrainIcon size={14} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
            color: 'var(--color-ink)',
          }}>
            {heading}
          </div>
          <a
            href={transitUrl(origin.lat, origin.lng, firstStopLat, firstStopLng)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-body)', fontSize: 11,
              color: 'var(--color-sage)', textDecoration: 'none',
            }}
          >
            Get directions from {cityName} →
          </a>
        </div>
      </div>
    )
  }

  // Full card mode — shared trail page
  return (
    <div style={{
      display: 'flex', gap: 16, position: 'relative', marginBottom: 8,
    }}>
      {/* Train icon circle */}
      <div style={{
        flexShrink: 0, width: 40, height: 40, borderRadius: '50%',
        background: '#5A8A9A', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1, marginTop: 4,
      }}>
        <TrainIcon size={18} />
      </div>

      {/* Connecting line down to first stop */}
      <div style={{
        position: 'absolute', left: 19, top: 48, width: 1, height: 'calc(100% + 16px)',
        background: 'var(--color-border)',
      }} />

      {/* Card */}
      <div style={{
        flex: 1, background: 'rgba(90, 138, 154, 0.04)',
        border: '1px solid rgba(90, 138, 154, 0.15)',
        borderRadius: 3, padding: '16px 20px',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
          color: 'var(--color-ink)', marginBottom: 8,
        }}>
          {heading}
        </div>
        <a
          href={transitUrl(origin.lat, origin.lng, firstStopLat, firstStopLng)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
            color: 'var(--color-sage)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          Get directions from {cityName} →
        </a>
      </div>
    </div>
  )
}

function TrainIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="16" rx="2" />
      <path d="M4 11h16" />
      <path d="M12 3v8" />
      <circle cx="8" cy="15" r="1" />
      <circle cx="16" cy="15" r="1" />
      <path d="m9 19-2 3" />
      <path d="m15 19 2 3" />
    </svg>
  )
}

export { CBD_COORDS, STATE_MAP, resolveOrigin }
