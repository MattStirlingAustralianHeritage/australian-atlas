'use client'

import { useMemo, useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════════
   RegionMapSelect — ghost-watermark map with grouped, counted region list
   ═══════════════════════════════════════════════════════════════════════
   Single composition: Australia silhouette at 8 % opacity behind a
   centred editorial list.  No map interactivity — the list does all
   selection work.  The map is pure atmosphere.

   The list is an honest, legible browser of the regions we can actually
   plan a stay through (≥5 active, visitable Rest listings each):

     • each row shows its LIVE stay count, e.g. "Margaret River · 15 stays"
       — real numbers from the portal, scoped to Rest (accommodation), the
       same scope that decides whether a region qualifies at all
     • rows are GROUPED BY STATE so repeated states (Tasmania has five
       qualifying regions) sit together instead of scattering down a flat
       count-ranked list
     • state sections are ordered by total coverage (most stays first),
       and within a section regions are ordered by stay count descending —
       both orderings are legible because the counts are on screen
     • a state filter lets you jump straight to one state
     • the old 01-26 numerals are gone: they encoded list position, not
       the coverage rank, so they were noise

   The SVG (/public/maps/australia-states.svg) is rendered as a
   decorative <img> with `fill: none` background and `fill: #1C1A17`
   states — ink-on-transparent, reading as a ghost on the cream
   planner background at 8 % opacity.                                  */

const STATE_NAMES = {
  ACT: 'Australian Capital Territory',
  NSW: 'New South Wales',
  NT: 'Northern Territory',
  QLD: 'Queensland',
  SA: 'South Australia',
  TAS: 'Tasmania',
  VIC: 'Victoria',
  WA: 'Western Australia',
}

function stayLabel(n) {
  return `${n} ${n === 1 ? 'stay' : 'stays'}`
}

export default function RegionMapSelect({ regions, selectedRegion, onSelect }) {
  /* ─── Detect reduced motion ──────────────────────────────────────── */
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  /* ─── Active state filter (null = all states) ────────────────────── */
  const [stateFilter, setStateFilter] = useState(null)

  /* ─── Group regions by state, ordered by total coverage ──────────── */
  const groups = useMemo(() => {
    const byState = new Map()
    for (const r of regions) {
      if (!byState.has(r.state)) byState.set(r.state, [])
      byState.get(r.state).push(r)
    }
    const out = []
    for (const [state, list] of byState) {
      // Region count is already attached; sort by stays desc within the state.
      const sorted = [...list].sort((a, b) => (b.listing_count || 0) - (a.listing_count || 0))
      const total = sorted.reduce((sum, r) => sum + (r.listing_count || 0), 0)
      out.push({ state, regions: sorted, total })
    }
    // State sections ordered by total coverage descending.
    out.sort((a, b) => b.total - a.total)
    return out
  }, [regions])

  const visibleGroups = stateFilter
    ? groups.filter(g => g.state === stateFilter)
    : groups

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

      {/* ── State filter chips ──────────────────────────────────────── */}
      <div
        className="region-state-filter"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 520,
          margin: '0 auto 8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          justifyContent: 'center',
        }}
      >
        <FilterChip
          label="All states"
          active={stateFilter === null}
          onClick={() => setStateFilter(null)}
        />
        {groups.map(g => (
          <FilterChip
            key={g.state}
            label={g.state}
            active={stateFilter === g.state}
            onClick={() => setStateFilter(prev => (prev === g.state ? null : g.state))}
          />
        ))}
      </div>

      {/* ── Region list — grouped by state ──────────────────────────── */}
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
        {visibleGroups.map(group => (
          <div key={group.state}>
            {/* State header */}
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              padding: '20px 4px 8px 12px',
              borderBottom: '1px solid rgba(28, 26, 23, 0.12)',
            }}>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--color-muted, #6B6760)',
              }}>
                {STATE_NAMES[group.state] || group.state}
              </span>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--color-muted, #6B6760)',
                opacity: 0.55,
                flexShrink: 0,
                marginLeft: 12,
              }}>
                {group.regions.length === 1 ? '1 region' : `${group.regions.length} regions`}
              </span>
            </div>

            {group.regions.map(r => {
              const isSelected = selectedRegion === r.name
              return (
                <button
                  key={r.name}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${r.name}, ${STATE_NAMES[r.state] || r.state}, ${stayLabel(r.listing_count || 0)}`}
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

                  {/* Live stay count */}
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    color: isSelected
                      ? 'var(--color-accent, #C4603A)'
                      : 'var(--color-muted, #6B6760)',
                    opacity: isSelected ? 0.85 : 0.7,
                    flexShrink: 0,
                    marginLeft: 16,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {stayLabel(r.listing_count || 0)}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* ── Responsive styles ───────────────────────────────────────── */}
      <style>{`
        @media (max-width: 640px) {
          .region-list-hero,
          .region-state-filter {
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

/* ─── State filter chip ──────────────────────────────────────────────── */
function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.04em',
        padding: '5px 12px',
        borderRadius: 999,
        cursor: 'pointer',
        background: active ? 'var(--color-ink, #1C1A17)' : 'transparent',
        color: active ? '#FAF8F4' : 'var(--color-muted, #6B6760)',
        border: active
          ? '1px solid var(--color-ink, #1C1A17)'
          : '1px solid rgba(28, 26, 23, 0.16)',
        transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
      }}
    >
      {label}
    </button>
  )
}
