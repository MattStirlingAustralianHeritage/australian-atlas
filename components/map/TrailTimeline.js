'use client'
// ============================================================
// TrailTimeline — the trail drawn as a route, not a list.
//
// A continuous line runs down the gutter; each stop is a
// numbered coin in its category colour sitting ON the line,
// with leg distances riding the line between stops. Stops are
// reordered by dragging the coin (pointer events, so touch
// works too) or with arrow keys on a focused coin. Concierge
// moments render inline as dashed "ghost" stops at the point
// in the day they'd fill — add or wave them away in place.
// ============================================================

import { useState, useRef, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'
import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import { localizeSubcategory } from '@/lib/i18n/listingLabels'

const SAGE = '#5f8a7e'
const GOLD = '#C4973B'
const INK = 'var(--color-ink)'
const LINE = 'rgba(90,74,56,0.28)'

// The rail column every timeline row shares: a vertical line segment with
// whatever marker (coin, glyph, nothing) centred on it.
function Rail({ top = true, bottom = true, dashed = false, children }) {
  const seg = (pos) => ({
    position: 'absolute', left: 14, width: 2,
    ...(pos === 'top' ? { top: 0, bottom: '50%' } : { top: '50%', bottom: 0 }),
    background: dashed
      ? `repeating-linear-gradient(180deg, ${LINE} 0 4px, transparent 4px 9px)`
      : LINE,
  })
  return (
    <div style={{ width: 30, alignSelf: 'stretch', position: 'relative', flexShrink: 0 }}>
      {top && <span aria-hidden style={seg('top')} />}
      {bottom && <span aria-hidden style={seg('bottom')} />}
      <span style={{ position: 'absolute', left: 15, top: '50%', transform: 'translate(-50%, -50%)', display: 'flex' }}>
        {children}
      </span>
    </div>
  )
}

function catLabelFor(stop, locale) {
  const subTypes = SUB_TYPE_LABELS[stop.vertical] || {}
  const enSub = subTypes[stop.sub_type]
  return enSub ? localizeSubcategory(stop.sub_type, enSub, locale) : getVerticalBadge(stop.vertical)
}

// Small hand-drawn glyph per concierge moment — coffee, midday sun, moon.
function MomentGlyph({ role }) {
  const common = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: GOLD, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (role === 'coffee') return <svg {...common}><path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" /></svg>
  if (role === 'lunch') return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" /></svg>
  return <svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
}

export default function TrailTimeline({
  stops, route, dayGroups, showDays,
  ghosts = [],                 // [{ role, kicker, prompt, listing, distanceKm, insertIndex }]
  tailConnects = false,        // an "+ add a place" row follows the last stop
  onReorder, onRemove, onSelect,
  onGhostAdd, onGhostDismiss,
}) {
  const t = useTranslations('map')
  const locale = useLocale()

  // ── Drag state ──
  const unitRefs = useRef([])            // one el per stop (leg + row unit)
  const [drag, setDrag] = useState(null) // { from, target, dy, rects }
  const dragMeta = useRef(null)          // { startY, rects, pointerId }

  const stopsLen = stops.length
  const beginDrag = useCallback((e, idx) => {
    if (e.button != null && e.button !== 0) return
    // Slice to the live stop count — removed stops leave stale tail refs.
    const rects = unitRefs.current.slice(0, stopsLen).map(el => el ? el.getBoundingClientRect() : null)
    if (!rects[idx]) return
    dragMeta.current = { startY: e.clientY, rects, pointerId: e.pointerId }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    setDrag({ from: idx, target: idx, dy: 0 })
    e.preventDefault()
  }, [stopsLen])

  const moveDrag = useCallback((e) => {
    const meta = dragMeta.current
    if (!meta) return
    const dy = e.clientY - meta.startY
    setDrag(d => {
      if (!d) return d
      const r = meta.rects[d.from]
      const centre = r.top + r.height / 2 + dy
      let target = 0
      for (let i = 0; i < meta.rects.length; i++) {
        if (i === d.from || !meta.rects[i]) continue
        const mid = meta.rects[i].top + meta.rects[i].height / 2
        if (centre > mid) target++
      }
      return { ...d, dy, target }
    })
  }, [])

  const endDrag = useCallback(() => {
    const d = drag
    dragMeta.current = null
    setDrag(null)
    if (d && d.target !== d.from) onReorder(d.from, d.target)
  }, [drag, onReorder])

  const cancelDrag = useCallback(() => {
    dragMeta.current = null
    setDrag(null)
  }, [])

  // Transform for each stop unit while a drag is live.
  const unitTransform = (i) => {
    if (!drag || !dragMeta.current) return undefined
    const { from } = drag
    const rects = dragMeta.current.rects
    if (i === from) return `translateY(${drag.dy}px)`
    const h = rects[from]?.height || 0
    const r = rects[from]
    const centre = r.top + r.height / 2 + drag.dy
    const mid = rects[i] ? rects[i].top + rects[i].height / 2 : 0
    if (i > from && centre > mid) return `translateY(${-h}px)`
    if (i < from && centre < mid) return `translateY(${h}px)`
    return undefined
  }

  const dragging = !!drag
  const count = stops.length

  // Ghost lookup: insertIndex → ghost row rendered before that stop index.
  // Ghosts stay in the layout during a drag (the drag maths measures row
  // rects once, at lift-off) — they just fade right back and go inert.
  const ghostsAt = (idx) => ghosts.filter(g => Math.min(g.insertIndex, count) === idx)

  const renderGhost = (g, { top = true, bottom = true } = {}) => {
    const color = getVerticalBrandColour(g.listing.vertical) || SAGE
    const km = g.distanceKm
    return (
      <div key={`ghost-${g.role}`} className="trail-ghost" style={{
        display: 'flex', alignItems: 'stretch',
        opacity: dragging ? 0.15 : 1, transition: 'opacity 0.2s',
        pointerEvents: dragging ? 'none' : 'auto',
      }}>
        <Rail dashed top={top} bottom={bottom}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%', boxSizing: 'border-box',
            border: `1.5px dashed ${GOLD}`, background: 'var(--color-cream, #FBF9F4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MomentGlyph role={g.role} />
          </span>
        </Rail>
        <div style={{ flex: 1, minWidth: 0, padding: '7px 0 7px 9px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => onSelect?.({ ...g.listing, latitude: g.listing.lat, longitude: g.listing.lng })} style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          }}>
            <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: GOLD, fontFamily: 'var(--font-sans)' }}>
              {g.kicker} · <span style={{ textTransform: 'none', letterSpacing: '0.02em', fontWeight: 500 }}>{g.prompt}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, minWidth: 0 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.listing.name}
              </span>
              {km != null && (
                <span style={{ fontSize: 10, color: 'var(--color-muted)', flexShrink: 0 }}>
                  {km < 1 ? '<1' : km < 10 ? km : Math.round(km)} km
                </span>
              )}
            </span>
          </button>
          <button onClick={() => onGhostAdd(g.listing, g.insertIndex)} aria-label={`${t('conciergeAdd')} — ${g.listing.name}`} style={{
            flexShrink: 0, width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
            border: `1px solid ${SAGE}`, background: 'rgba(95,138,126,0.08)', color: SAGE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button onClick={() => onGhostDismiss(g.role)} aria-label={t('trailGhostDismiss')} className="trail-ghost-dismiss" style={{
            flexShrink: 0, width: 22, height: 22, border: 'none', background: 'none', cursor: 'pointer',
            color: 'var(--color-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    )
  }

  let flatIndex = -1
  return (
    <div style={{ position: 'relative' }}>
      {dayGroups.map((group, gIdx) => (
        <div key={group.day ?? 'all'}>
          {showDays && group.day != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: gIdx === 0 ? '2px 0 3px' : '12px 0 3px', opacity: dragging ? 0.3 : 1, transition: 'opacity 0.2s' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: SAGE, fontFamily: 'var(--font-sans)' }}>
                {t('trailDayLabel', { day: group.day })}
              </span>
              <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>
          )}
          {group.stops.map((s, gi) => {
            flatIndex += 1
            const i = flatIndex
            const color = getVerticalBrandColour(s.vertical) || SAGE
            const leg = gi > 0 ? route.legs[i - 1] : null
            const isDragged = drag?.from === i
            const ghostRows = ghostsAt(i)
            const hasTrailingRow = ghostsAt(count).length > 0 || tailConnects
            return (
              <div key={s.id}>
                {ghostRows.map((g, gj) => renderGhost(g, { top: !(i === 0 && gj === 0), bottom: true }))}
                <div
                  ref={el => { unitRefs.current[i] = el }}
                  style={{
                    transform: unitTransform(i),
                    transition: isDragged ? 'none' : 'transform 0.18s ease',
                    position: 'relative',
                    zIndex: isDragged ? 3 : 1,
                  }}
                >
                  {leg && (
                    <div style={{ display: 'flex', alignItems: 'stretch', opacity: dragging ? 0.2 : 1, transition: 'opacity 0.2s' }}>
                      <Rail />
                      <span style={{ fontSize: 9.5, color: 'var(--color-muted)', letterSpacing: '0.03em', fontFamily: 'var(--font-sans)', padding: '3px 0 3px 9px' }}>
                        {route.approx ? '≈ ' : ''}{leg.km} km · {leg.min} {t('trailMinShort')}
                      </span>
                    </div>
                  )}
                  <div
                    className="trail-stop-row"
                    style={{
                      display: 'flex', alignItems: 'stretch', borderRadius: 8,
                      background: isDragged ? 'rgba(251,249,244,0.99)' : 'transparent',
                      boxShadow: isDragged ? '0 8px 22px rgba(82,58,30,0.22)' : 'none',
                    }}
                  >
                    <Rail top={i !== 0 || ghostRows.length > 0} bottom={i !== count - 1 || hasTrailingRow}>
                      <button
                        className="trail-coin"
                        onPointerDown={e => beginDrag(e, i)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={cancelDrag}
                        onKeyDown={e => {
                          if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); onReorder(i, i - 1) }
                          if (e.key === 'ArrowDown' && i < count - 1) { e.preventDefault(); onReorder(i, i + 1) }
                          if (e.key === 'Escape') cancelDrag()
                        }}
                        aria-label={t('trailDragHint', { name: s.name, index: i + 1, count })}
                        style={{
                          width: 26, height: 26, minWidth: 26, borderRadius: '50%', boxSizing: 'border-box',
                          border: '2px solid var(--color-cream, #FBF9F4)',
                          background: color, color: '#fff', fontSize: 11.5, fontWeight: 700, lineHeight: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: isDragged ? 'grabbing' : 'grab', touchAction: 'none',
                          fontFamily: 'var(--font-sans)', boxShadow: '0 1px 4px rgba(82,58,30,0.22)',
                          padding: 0,
                        }}
                      >{i + 1}</button>
                    </Rail>
                    <button
                      onClick={() => !dragging && onSelect?.(s)}
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
                        padding: '8px 0 8px 9px', cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 14, color: INK, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                      </span>
                      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--color-muted)', marginTop: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[catLabelFor(s, locale), s.region].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    <button
                      onClick={() => onRemove(s.id)}
                      aria-label={`${t('trailRemoveStop')} — ${s.name}`}
                      className="trail-remove"
                      style={{
                        alignSelf: 'center', width: 26, height: 26, flexShrink: 0,
                        border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
      {/* Trailing ghosts (a bed at the end of the day). */}
      {ghostsAt(count).map((g, gj, arr) => renderGhost(g, {
        top: count > 0 || gj > 0,
        bottom: tailConnects || gj < arr.length - 1,
      }))}
    </div>
  )
}
