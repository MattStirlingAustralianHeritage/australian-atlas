'use client'

import React, { useState } from 'react'
import { getVerticalBadge, VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_ACCENTS

function fmtDuration(min) {
  if (min == null) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

function fmtKm(km) {
  if (km == null) return ''
  return km >= 10 ? `${Math.round(km)} km` : `${km} km`
}

/**
 * StopsPanel — the ordered stop list.
 *
 * - drag a card (or use the ↑/↓ buttons) to reorder
 * - a leg chip between consecutive cards shows real drive/walk time+distance
 * - the header totals the whole trail and offers a shortest-order cleanup
 * - removals get a one-step undo so a mis-tap never costs work
 */
// Per-stop note hints, Alpaca-style narrative micro-actions — rotated so the
// list teaches by example ("pick up croissants", "book ahead").
const NOTE_HINTS = [
  'Add a note — e.g. "pick up coffee for the drive"',
  'Add a note — e.g. "book a table ahead"',
  'Add a note — e.g. "best light in the morning"',
  'Add a note — e.g. "ask for the cellar tasting"',
  'Add a note — e.g. "good leg-stretch walk here"',
]

export default function StopsPanel({
  stops, notes, legs, totalKm, totalMin, approx,
  transportMode, neighbourhoodLabel,
  onNoteChange, onRemove, onReorder, onOptimise, optimiseSavingsKm = 0,
  lastRemoved, onUndoRemove, onDismissUndo,
  maxStops,
}) {
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)

  const modeLabel = transportMode === 'drive' ? 'drive' : 'walk'

  return (
    <div style={{ padding: '12px 20px 16px' }}>
      {/* Undo toast */}
      {lastRemoved && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '8px 12px', marginBottom: 10, background: '#fff',
          border: '1px solid var(--color-border)', borderRadius: 4,
          fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)',
        }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Removed <strong style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{lastRemoved.stop.name}</strong>
          </span>
          <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button onClick={onUndoRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5F8A7E', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-body)', padding: 0 }}>
              Undo
            </button>
            <button onClick={onDismissUndo} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 13, padding: 0, lineHeight: 1 }}>
              ×
            </button>
          </span>
        </div>
      )}

      {stops.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '26px 16px 10px', color: 'var(--color-muted)',
          fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.8,
        }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
            No stops yet
          </div>
          Click any pin on the map, search above, or start from a suggestion.
        </div>
      ) : (
        <>
          {/* Header: count + totals + optimise */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8, gap: 8, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              {stops.length} stop{stops.length !== 1 ? 's' : ''}
              {stops.length >= maxStops && <span style={{ color: '#b0492f' }}> · max reached</span>}
            </div>
            {stops.length >= 4 && (
              <button onClick={onOptimise} title="Reorder stops into the shortest run from your first stop" style={{
                background: optimiseSavingsKm > 0 ? 'rgba(95,138,126,0.12)' : 'none',
                border: `1px solid ${optimiseSavingsKm > 0 ? 'rgba(95,138,126,0.5)' : 'var(--color-border)'}`,
                borderRadius: 4,
                padding: '4px 9px', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.05em', color: optimiseSavingsKm > 0 ? '#3D6B60' : 'var(--color-muted)', fontFamily: 'var(--font-body)',
              }}>
                ⇄ Shortest order{optimiseSavingsKm > 0 ? ` · save ~${optimiseSavingsKm} km` : ''}
              </button>
            )}
          </div>

          {/* Totals strip */}
          {stops.length >= 2 && (totalKm > 0 || totalMin > 0) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', marginBottom: 10,
              background: 'rgba(95,138,126,0.07)', border: '1px solid rgba(95,138,126,0.18)', borderRadius: 4,
              fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)',
            }}>
              <span style={{ fontWeight: 600 }}>{fmtKm(totalKm)}</span>
              <span style={{ color: 'var(--color-border)' }}>·</span>
              <span style={{ fontWeight: 600 }}>{fmtDuration(totalMin)}</span>
              <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>
                total {modeLabel}{approx ? ' (approx.)' : ''}
              </span>
              {transportMode === 'neighbourhood' && neighbourhoodLabel && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5A8A9A', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {neighbourhoodLabel}
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {stops.map((stop, i) => {
              const color = VERTICAL_COLORS[stop.vertical] || '#5F8A7E'
              const isDragging = dragIndex === i
              const isOver = overIndex === i && dragIndex !== null && dragIndex !== i
              return (
                <React.Fragment key={stop.id}>
                  {/* Leg chip between stops */}
                  {i > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0 3px 11px' }}>
                      <div style={{ width: 2, height: 14, background: 'var(--color-border)', marginLeft: 1 }} />
                      {legs[i - 1] && (
                        <span style={{ fontSize: 10.5, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.02em' }}>
                          {fmtDuration(legs[i - 1].min)} · {fmtKm(legs[i - 1].km)} {modeLabel}
                        </span>
                      )}
                    </div>
                  )}

                  <div
                    draggable
                    onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnter={() => setOverIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i)
                      setDragIndex(null); setOverIndex(null)
                    }}
                    onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                    style={{
                      background: '#fff',
                      border: `1px solid ${isOver ? '#5F8A7E' : 'var(--color-border)'}`,
                      borderRadius: 4, padding: '9px 10px 9px 8px',
                      opacity: isDragging ? 0.45 : 1,
                      boxShadow: isOver ? '0 0 0 1px #5F8A7E inset' : 'none',
                      transition: 'border-color 0.1s, opacity 0.1s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {/* Drag handle */}
                      <span
                        aria-hidden
                        style={{ cursor: 'grab', color: 'var(--color-border)', display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 2px', flexShrink: 0 }}
                      >
                        <span style={{ display: 'flex', gap: 2 }}><Dot /><Dot /></span>
                        <span style={{ display: 'flex', gap: 2 }}><Dot /><Dot /></span>
                        <span style={{ display: 'flex', gap: 2 }}><Dot /><Dot /></span>
                      </span>

                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', background: color,
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-body)',
                      }}>
                        {i + 1}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {stop.slug
                            ? <a href={`/place/${stop.slug}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{stop.name}</a>
                            : stop.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color, fontFamily: 'var(--font-body)' }}>
                            {getVerticalBadge(stop.vertical)}
                          </span>
                          {stop.region && (
                            <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {stop.region}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        <IconBtn label="Move up" disabled={i === 0} onClick={() => onReorder(i, i - 1)}>↑</IconBtn>
                        <IconBtn label="Move down" disabled={i === stops.length - 1} onClick={() => onReorder(i, i + 1)}>↓</IconBtn>
                        <IconBtn label={`Remove ${stop.name}`} onClick={() => onRemove(stop.id)}>×</IconBtn>
                      </div>
                    </div>

                    <input
                      value={notes[stop.id] || ''}
                      onChange={e => onNoteChange(stop.id, e.target.value)}
                      placeholder={NOTE_HINTS[i % NOTE_HINTS.length]}
                      style={{
                        width: '100%', marginTop: 5, padding: '4px 0',
                        fontFamily: 'var(--font-body)', fontSize: 12,
                        color: 'var(--color-muted)', background: 'transparent',
                        border: 'none', borderBottom: '1px dashed var(--color-border)',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function Dot() {
  return <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
}

function IconBtn({ children, label, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: 30, height: 30, border: '1px solid var(--color-border)',
        background: 'transparent', color: 'var(--color-muted)', borderRadius: 4,
        fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}
