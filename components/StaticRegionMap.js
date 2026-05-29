'use client'

import { useState, useMemo, useRef, useEffect } from 'react'

/* ═══════════════════════════════════════════════════════════════════════
   StaticRegionMap — Mapbox Static Images API map with HTML overlay markers
   ═══════════════════════════════════════════════════════════════════════
   Renders the Atlas custom style as a single <img>, with region markers
   positioned via lat/lng → pixel conversion over the known bounding box.

   No Mapbox GL runtime. No tile loading. No style fallback possible.
   The map's job is orientation; the list is the precision tool.        */

const MAPBOX_STYLE = 'mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k'

/* ─── Australia bounding box for the static image ─────────────────────── */
const BBOX = {
  west: 112.0,
  south: -44.5,
  east: 155.0,
  north: -9.5,
}

/* ─── Image dimensions ────────────────────────────────────────────────── */
const IMG_WIDTH = 800
const IMG_HEIGHT = 600

/* ─── Web Mercator projection helpers ─────────────────────────────────── */
function latToMercatorY(lat) {
  const latRad = (lat * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + latRad / 2))
}

function lngToPixelX(lng, containerWidth) {
  return ((lng - BBOX.west) / (BBOX.east - BBOX.west)) * containerWidth
}

function latToPixelY(lat, containerHeight) {
  const yNorth = latToMercatorY(BBOX.north)
  const ySouth = latToMercatorY(BBOX.south)
  const yPoint = latToMercatorY(lat)
  return ((yNorth - yPoint) / (yNorth - ySouth)) * containerHeight
}


export default function StaticRegionMap({
  regions,
  selectedRegion,
  hoveredRegion,
  onSelect,
  onHover,
}) {
  const containerRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)

  /* ─── Detect reduced motion ──────────────────────────────────────── */
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  /* ─── Measure container for marker positioning ───────────────────── */
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  /* ─── Static image URL ───────────────────────────────────────────── */
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const staticUrl = useMemo(() => {
    if (!token) return null
    // bbox format: [west,south,east,north]
    const bbox = `[${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}]`
    return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${bbox}/${IMG_WIDTH}x${IMG_HEIGHT}@2x?access_token=${token}&attribution=false&logo=false`
  }, [token])

  /* ─── Regions with valid coordinates ─────────────────────────────── */
  const mappableRegions = useMemo(() =>
    regions.filter(r => r.lat != null && r.lng != null),
    [regions]
  )

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#2d2a24',
        aspectRatio: `${IMG_WIDTH} / ${IMG_HEIGHT}`,
      }}
    >
      {/* Static map image */}
      {staticUrl && (
        <img
          src={staticUrl}
          alt="Map of Australia showing covered regions"
          loading="eager"
          onLoad={() => setImageLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: imageLoaded ? 1 : 0,
            transition: prefersReducedMotion ? 'none' : 'opacity 0.3s ease',
          }}
        />
      )}

      {/* Overlay markers */}
      {imageLoaded && containerSize.width > 0 && mappableRegions.map(r => {
        const x = lngToPixelX(r.lng, containerSize.width)
        const y = latToPixelY(r.lat, containerSize.height)
        const isSelected = selectedRegion === r.name
        const isHovered = hoveredRegion === r.name
        const isHighlighted = isSelected || isHovered

        return (
          <button
            key={r.name}
            aria-label={`Select ${r.name}`}
            onClick={() => onSelect(r.name)}
            onMouseEnter={() => onHover && onHover(r.name)}
            onMouseLeave={() => onHover && onHover(null)}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: 'translate(-50%, -50%)',
              width: isHighlighted ? 14 : 10,
              height: isHighlighted ? 14 : 10,
              borderRadius: '50%',
              background: isHighlighted
                ? 'var(--color-accent, #C4603A)'
                : 'rgba(196, 96, 58, 0.55)',
              border: isSelected
                ? '2px solid rgba(255, 255, 255, 0.8)'
                : 'none',
              boxShadow: isHighlighted
                ? '0 0 0 3px rgba(196, 96, 58, 0.25)'
                : 'none',
              cursor: 'pointer',
              padding: 0,
              zIndex: isHighlighted ? 10 : 1,
              transition: prefersReducedMotion
                ? 'background 0.15s ease'
                : 'all 0.15s ease',
            }}
          >
            {/* Hover label */}
            {isHovered && !isSelected && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 6,
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#F8F6F1',
                  background: 'rgba(28, 26, 23, 0.85)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
              >
                {r.name}
              </span>
            )}
            {/* Selected label */}
            {isSelected && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 6,
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-accent, #C4603A)',
                  background: 'rgba(248, 246, 241, 0.92)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
              >
                {r.name}
              </span>
            )}
          </button>
        )
      })}

      {/* Mapbox attribution (required) */}
      <span style={{
        position: 'absolute',
        bottom: 2,
        right: 4,
        fontSize: 9,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: 'var(--font-body)',
        pointerEvents: 'none',
      }}>
        © Mapbox
      </span>
    </div>
  )
}
