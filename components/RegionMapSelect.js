'use client'

import { useState, useRef, useMemo } from 'react'
import StaticRegionMap from './StaticRegionMap'

/* ═══════════════════════════════════════════════════════════════════════
   RegionMapSelect — static map + synced list region selector
   ═══════════════════════════════════════════════════════════════════════
   Two-panel layout: Atlas-styled static map (left) + scrollable editorial
   list (right). Hover/select synced both ways.

   Desktop: map ~55%, list ~45%. Narrow: stacked, list primary.
   Map: Mapbox Static Images API with HTML overlay markers.
   List: editorial rows with numeral, name, state code.                */


/* ─── Detect reduced motion preference ────────────────────────────────── */
function usePrefersReducedMotion() {
  return useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])
}


export default function RegionMapSelect({ regions, selectedRegion, onSelect }) {
  const [hoveredRegion, setHoveredRegion] = useState(null)
  const [showMap, setShowMap] = useState(false) // mobile toggle
  const listRowRefs = useRef({})
  const prefersReducedMotion = usePrefersReducedMotion()

  // ── Hover handler (bidirectional: map ↔ list) ──────────────────────
  const handleHover = (regionName) => {
    setHoveredRegion(regionName)
    // Scroll hovered region into view in list
    if (regionName && listRowRefs.current[regionName]) {
      listRowRefs.current[regionName].scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      })
    }
  }


  return (
    <div>
      {/* ── Mobile map toggle ────────────────────────────────────── */}
      <div style={{
        display: 'none', // hidden on desktop, shown via media query below
        marginBottom: 16,
      }}
        className="region-map-mobile-toggle"
      >
        <button
          onClick={() => setShowMap(v => !v)}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-muted, #6B6760)',
            background: 'transparent',
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            borderRadius: 6,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          {showMap ? 'Hide map' : 'Show map'}
        </button>
      </div>

      {/* ── Two-panel layout ─────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 24,
        minHeight: 440,
      }}
        className="region-map-panels"
      >
        {/* Map panel — static image with overlay markers */}
        <div
          style={{
            flex: '0 0 55%',
            minHeight: 300,
          }}
          className="region-map-panel"
        >
          <StaticRegionMap
            regions={regions}
            selectedRegion={selectedRegion}
            hoveredRegion={hoveredRegion}
            onSelect={onSelect}
            onHover={handleHover}
          />
        </div>

        {/* List panel */}
        <div
          style={{
            flex: 1,
            maxHeight: 480,
            overflowY: 'auto',
            borderTop: '1px solid rgba(28,26,23,0.08)',
          }}
          className="region-list-panel"
        >
          {regions.map((r, i) => {
            const isSelected = selectedRegion === r.name
            const isHovered = hoveredRegion === r.name
            const numeral = String(i + 1).padStart(2, '0')

            return (
              <button
                key={r.name}
                ref={el => { listRowRefs.current[r.name] = el }}
                role="option"
                aria-selected={isSelected}
                aria-label={`${r.name}, ${r.state}`}
                onClick={() => onSelect(r.name)}
                onMouseEnter={() => handleHover(r.name)}
                onMouseLeave={() => handleHover(null)}
                onFocus={() => handleHover(r.name)}
                onBlur={() => handleHover(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 4px 14px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(28,26,23,0.08)',
                  borderLeft: isSelected ? '2px solid var(--color-accent, #C4603A)' : '2px solid transparent',
                  paddingLeft: 12,
                  cursor: 'pointer',
                  transition: prefersReducedMotion
                    ? 'border-color 0.15s ease'
                    : 'border-color 0.15s ease, transform 0.18s ease',
                  transform: (!prefersReducedMotion && isHovered && !isSelected) ? 'translateY(-1px)' : 'none',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {/* Numeral */}
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 13,
                  color: isSelected
                    ? 'var(--color-accent, #C4603A)'
                    : 'var(--color-muted, #6B6760)',
                  opacity: isSelected ? 0.8 : 0.35,
                  minWidth: 28,
                  flexShrink: 0,
                }}>
                  {numeral}
                </span>

                {/* Name */}
                <span style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected
                    ? 'var(--color-accent, #C4603A)'
                    : 'var(--color-ink, #1C1A17)',
                  lineHeight: 1.3,
                }}>
                  {r.name}
                </span>

                {/* State code */}
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-muted, #6B6760)',
                  opacity: 0.5,
                  flexShrink: 0,
                  marginLeft: 12,
                }}>
                  {r.state}
                </span>

                {/* Hover arrow */}
                <span style={{
                  fontSize: 14,
                  color: 'var(--color-muted, #6B6760)',
                  opacity: isHovered && !prefersReducedMotion ? 0.6 : 0,
                  transform: isHovered && !prefersReducedMotion ? 'translateX(0)' : 'translateX(4px)',
                  transition: 'opacity 0.18s ease, transform 0.18s ease',
                  marginLeft: 8,
                  flexShrink: 0,
                }}>
                  →
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Responsive styles (injected once) ────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .region-map-mobile-toggle {
            display: block !important;
          }
          .region-map-panels {
            flex-direction: column !important;
            gap: 16px !important;
          }
          .region-map-panel {
            flex: none !important;
            display: ${showMap ? 'block' : 'none'} !important;
          }
          .region-list-panel {
            max-height: 360px !important;
          }
        }
      `}</style>
    </div>
  )
}
