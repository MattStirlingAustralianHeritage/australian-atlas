'use client'

import { useMemo } from 'react'

/* ═══════════════════════════════════════════════════════════════════════
   RegionMapSelect — ghost-watermark map with editorial region list
   ═══════════════════════════════════════════════════════════════════════
   Single composition: Australia silhouette at 8 % opacity behind a
   centred editorial list.  No map interactivity — the list does all
   selection work.  The map is pure atmosphere.

   The SVG (/public/maps/australia-states.svg) is rendered as a
   decorative <img> with `fill: none` background and `fill: #1C1A17`
   states — ink-on-transparent, reading as a ghost on the cream
   planner background at 8 % opacity.                                  */


export default function RegionMapSelect({ regions, selectedRegion, onSelect }) {
  /* ─── Detect reduced motion ──────────────────────────────────────── */
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])


  return (
    <div style={{ position: 'relative', width: '100%' }}>

      {/* ── Ghost watermark — Australia silhouette ──────────────────── */}
      <div
        aria-hidden="true"
        className="region-watermark"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 560,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <img
          src="/maps/australia-states.svg"
          alt=""
          draggable={false}
          style={{
            width: '65%',
            maxWidth: 400,
            height: 'auto',
            opacity: 0.08,
          }}
        />
      </div>

      {/* ── Region list — editorial hero ────────────────────────────── */}
      <div
        role="listbox"
        aria-label="Select a region"
        className="region-list-hero"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 520,
          margin: '0 auto',
        }}
      >
        {regions.map((r, i) => {
          const isSelected = selectedRegion === r.name
          const numeral = String(i + 1).padStart(2, '0')

          return (
            <button
              key={r.name}
              role="option"
              aria-selected={isSelected}
              aria-label={`${r.name}, ${r.state}`}
              onClick={() => onSelect(r.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                textAlign: 'left',
                padding: '16px 4px 16px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(28, 26, 23, 0.06)',
                borderLeft: isSelected
                  ? '2px solid var(--color-accent, #C4603A)'
                  : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                transition: prefersReducedMotion
                  ? 'border-color 0.15s ease'
                  : 'border-color 0.15s ease, background-color 0.15s ease',
              }}
            >
              {/* Numeral */}
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                color: isSelected
                  ? 'var(--color-accent, #C4603A)'
                  : 'var(--color-muted, #6B6760)',
                opacity: isSelected ? 0.8 : 0.3,
                minWidth: 32,
                flexShrink: 0,
              }}>
                {numeral}
              </span>

              {/* Region name */}
              <span style={{
                flex: 1,
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: isSelected ? 600 : 400,
                color: isSelected
                  ? 'var(--color-accent, #C4603A)'
                  : 'var(--color-ink, #1C1A17)',
                lineHeight: 1.35,
              }}>
                {r.name}
              </span>

              {/* State tag */}
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--color-muted, #6B6760)',
                opacity: 0.5,
                flexShrink: 0,
                marginLeft: 16,
              }}>
                {r.state}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Responsive styles ───────────────────────────────────────── */}
      <style>{`
        @media (max-width: 640px) {
          .region-list-hero {
            max-width: 100% !important;
          }
          .region-watermark {
            height: 400px !important;
          }
        }
      `}</style>
    </div>
  )
}
