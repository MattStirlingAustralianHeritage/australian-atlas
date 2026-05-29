'use client'

import { useState, useMemo, useRef, useEffect } from 'react'

/* ═══════════════════════════════════════════════════════════════════════
   DEAD CODE — replaced by ghost-watermark design in RegionMapSelect.js
   (Fix 13d).  Kept for reference; safe to delete in a later clean-up.
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════
   StaticRegionMap — local SVG map with HTML overlay markers
   ═══════════════════════════════════════════════════════════════════════
   Renders a dark-styled SVG of Australia as a single <img>,
   with region markers positioned via lat/lng → pixel conversion.

   No Mapbox runtime, no third-party tile service. The SVG is a local
   asset in /public/maps/. The map's job is orientation; the list is
   the precision tool.                                                  */


/* ─── SVG coordinate system (cropped to filled map only) ─────────────── */
const SVG_WIDTH  = 2500                    // viewBox width (cropped)
const SVG_HEIGHT = 2870.86                 // viewBox height

/* ─── Geographic extent the SVG viewBox covers ───────────────────────── */
/* The filled Australia map sits at SVG ≈(670, 600)→(2392, 2175).       *
 * These GEO bounds map the full viewBox to geographic coordinates.     *
 * Calibrated iteratively against known city positions.                  */
const GEO = {
  west:  96.0,
  east:  162.0,
  north: 2.0,
  south: -57.0,
}

/* ─── Image bounds within container (object-fit: contain, non-square SVG) */
function getImageBounds(containerWidth, containerHeight) {
  const svgAspect = SVG_WIDTH / SVG_HEIGHT
  const containerAspect = containerWidth / containerHeight
  let renderedWidth, renderedHeight

  if (containerAspect > svgAspect) {
    /* Container is wider than SVG — image constrained by height */
    renderedHeight = containerHeight
    renderedWidth  = containerHeight * svgAspect
  } else {
    /* Container is taller than SVG — image constrained by width */
    renderedWidth  = containerWidth
    renderedHeight = containerWidth / svgAspect
  }

  return {
    renderedWidth,
    renderedHeight,
    offsetX: (containerWidth  - renderedWidth)  / 2,
    offsetY: (containerHeight - renderedHeight) / 2,
  }
}

/* ─── Coordinate conversion: lng → pixel X (equirectangular) ─────────── */
function lngToPixelX(lng, containerWidth, containerHeight) {
  const { renderedWidth, offsetX } = getImageBounds(containerWidth, containerHeight)
  const fraction = (lng - GEO.west) / (GEO.east - GEO.west)
  return fraction * renderedWidth + offsetX
}

/* ─── Coordinate conversion: lat → pixel Y (equirectangular) ─────────── */
function latToPixelY(lat, containerWidth, containerHeight) {
  const { renderedHeight, offsetY } = getImageBounds(containerWidth, containerHeight)
  const fraction = (GEO.north - lat) / (GEO.north - GEO.south)
  return fraction * renderedHeight + offsetY
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
        aspectRatio: '4 / 3',
      }}
    >
      {/* Local SVG map image */}
      <img
        src="/maps/australia-states.svg"
        alt="Map of Australia showing covered regions"
        loading="eager"
        onLoad={() => setImageLoaded(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          opacity: imageLoaded ? 1 : 0,
          transition: prefersReducedMotion ? 'none' : 'opacity 0.3s ease',
        }}
      />

      {/* Overlay markers */}
      {imageLoaded && containerSize.width > 0 && mappableRegions.map(r => {
        const x = lngToPixelX(r.lng, containerSize.width, containerSize.height)
        const y = latToPixelY(r.lat, containerSize.width, containerSize.height)
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
    </div>
  )
}
