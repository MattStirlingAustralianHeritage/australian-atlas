'use client'

/**
 * TriageBoard — the bulk lane of Candidate Review.
 *
 * The card flow is right for judgement calls but brutal for volume: every
 * candidate costs a full-card read even when the gate evidence already tells
 * the story. This board shows the whole queue as compact rows (score, gate
 * flags, region, auto-detected subcategory) so obvious decisions happen in
 * sweeps: sort worst-first and cull, sort best-first and publish, and send
 * anything that needs real editing to the card with one key.
 *
 * Publishing from here sends the SAME payload the card sends when the reviewer
 * touches nothing — card defaults + the candidate's own values — through the
 * same background publisher. Way candidates are card-only (their editorial
 * panel is mandatory), so the board can only skip or open them.
 *
 * Keyboard: ↑/↓ or J/K move · X/Space select · Y publish · N skip ·
 * Enter expand · O open card · Esc clear selection.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  VERTICAL_NAMES, VERTICAL_COLORS, SUBCATEGORY_OPTIONS,
  scoreOf, resolveSubcategory, gateFailures, isPublishReady, buildTriagePayload,
} from './reviewMeta'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'ready', label: 'Ready' },
  { key: 'strong', label: 'Strong 80+' },
  { key: 'weak', label: 'Weak <65' },
  { key: 'flagged', label: 'Gate fails' },
]

function ScoreChip({ score }) {
  const color = score == null ? 'var(--color-muted)'
    : score >= 80 ? '#4A7C59'
    : score >= 65 ? '#C49A3C'
    : '#CC4444'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 34, padding: '2px 6px', borderRadius: 5, flexShrink: 0,
      fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700,
      color, background: score == null ? 'var(--color-cream)' : `${color}14`,
      border: `1px solid ${score == null ? 'var(--color-border)' : `${color}30`}`,
    }}>
      {score == null ? '—' : score}
    </span>
  )
}

function GateFlags({ failures }) {
  if (failures.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
      {failures.map(f => (
        <span key={f} style={{
          fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: '#CC4444', background: '#CC444412',
          border: '1px solid #CC444430', borderRadius: 4, padding: '1px 5px',
        }}>
          ✗ {f}
        </span>
      ))}
    </span>
  )
}

function RowSubcategorySelect({ candidate, value, onChange }) {
  const opts = SUBCATEGORY_OPTIONS[candidate.vertical] || []
  if (candidate.vertical === 'way') {
    return (
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600,
        letterSpacing: '0.05em', textTransform: 'uppercase',
        color: 'var(--color-muted)', background: 'var(--color-cream)',
        borderRadius: 4, padding: '2px 6px', flexShrink: 0,
      }} title="Way Atlas needs the card — editorial classification is mandatory">
        card only
      </span>
    )
  }
  if (opts.length === 0) return null
  const color = VERTICAL_COLORS[candidate.vertical] || 'var(--color-muted)'
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      title="Subcategory used when publishing from the board"
      style={{
        fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
        color: value ? color : '#CC4444',
        background: value ? `${color}0E` : '#CC44440E',
        border: `1px solid ${value ? `${color}35` : '#CC444440'}`,
        borderRadius: 4, padding: '2px 4px', maxWidth: 130,
        cursor: 'pointer', outline: 'none', flexShrink: 0,
      }}
    >
      <option value="">needs subcat…</option>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// Expanded detail panel — enough context to decide without the full card.
function RowDetail({ candidate, onPublish, onSkip, onOpenCard, canPublish }) {
  const gr = candidate.gate_results
  const gateLines = []
  if (gr?.gates) {
    const g = gr.gates
    if (g.gate0) gateLines.push({ pass: g.gate0.pass, text: 'Not a duplicate' })
    if (g.gate1) gateLines.push({ pass: g.gate1.pass, text: `Website — ${g.gate1.url || 'verified'}` })
    if (g.gate2) gateLines.push({ pass: g.gate2.pass, text: `Address — ${g.gate2.placeName || (g.gate2.details?.warning || 'verified')}` })
    if (g.gate3) gateLines.push({ pass: g.gate3.pass, text: `Active — ${(g.gate3.signals || []).slice(0, 2).join(', ') || 'confirmed'}` })
    if (g.gate4) gateLines.push({ pass: g.gate4.pass, text: `Fit — ${g.gate4.justification || g.gate4.details?.warning || 'confirmed'}` })
  }
  return (
    <div style={{
      padding: '12px 16px 14px 60px',
      background: 'var(--color-cream)',
      borderTop: '1px dashed var(--color-border)',
      display: 'grid', gap: 10,
    }}>
      {(candidate.description || candidate.notes) && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.5, color: 'var(--color-ink)', maxWidth: 640 }}>
          {candidate.description || candidate.notes}
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
        {candidate.address && <span>{candidate.address}</span>}
        {candidate.website_url && (
          <a href={candidate.website_url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#1565C0', textDecoration: 'none' }}>
            {candidate.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} ↗
          </a>
        )}
        {candidate.source && <span>via {String(candidate.source).replace(/_/g, ' ')}</span>}
      </div>
      {gateLines.length > 0 && (
        <div style={{ display: 'grid', gap: 3 }}>
          {gateLines.map((l, i) => (
            <div key={i} style={{
              fontFamily: 'var(--font-body)', fontSize: 11, lineHeight: 1.4,
              color: l.pass ? '#4A7C59' : '#CC4444',
              display: 'flex', gap: 6, alignItems: 'flex-start',
            }}>
              <span style={{ flexShrink: 0 }}>{l.pass ? '✓' : '✗'}</span>
              <span style={{ color: l.pass ? 'var(--color-muted)' : '#CC4444' }}>{l.text}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={e => { e.stopPropagation(); onPublish() }} disabled={!canPublish}
          title={canPublish ? 'Publish with board defaults (Y)' : candidate.vertical === 'way' ? 'Way publishes from the card only' : 'Pick a subcategory first'}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: '#fff',
            background: canPublish ? '#4A7C59' : '#a0b8ae', border: 'none', borderRadius: 6,
            padding: '5px 14px', cursor: canPublish ? 'pointer' : 'default',
          }}>
          Publish
        </button>
        <button onClick={e => { e.stopPropagation(); onSkip() }}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, color: 'var(--color-muted)',
            background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6,
            padding: '5px 14px', cursor: 'pointer',
          }}>
          Skip
        </button>
        <button onClick={e => { e.stopPropagation(); onOpenCard() }}
          title="Open in the card flow for full editing (O)"
          style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, color: 'var(--color-ink)',
            background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6,
            padding: '5px 14px', cursor: 'pointer',
          }}>
          Open card
        </button>
      </div>
    </div>
  )
}

export default function TriageBoard({
  candidates,           // filtered (by vertical tab) pending candidates
  showVertical,         // true when no vertical filter is active
  onPublishOne,         // (candidate, payload) => void  — single, normal undo (Z)
  onSkipOne,            // (candidate) => void
  onBulk,               // (kind: 'publish'|'skip', items: [{candidate, payload?}]) => void
  onOpenCard,           // (candidateId) => void — pin to front of card flow
}) {
  const [filter, setFilter] = useState('all')
  const [sortDir, setSortDir] = useState('desc') // 'desc' best-first | 'asc' worst-first
  const [selected, setSelected] = useState(() => new Set())
  const [cursorId, setCursorId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [subcatById, setSubcatById] = useState({})
  const [flash, setFlash] = useState(null) // transient hint, e.g. "Way needs the card"
  const rowRefs = useRef({})
  const lastClickedIndexRef = useRef(null)

  const subFor = useCallback(
    c => subcatById[c.id] !== undefined ? subcatById[c.id] : resolveSubcategory(c),
    [subcatById],
  )

  // Decorate + filter + sort. gateFailures/scoreOf are cheap JSON reads.
  const rows = useMemo(() => {
    const decorated = candidates.map(c => {
      const score = scoreOf(c)
      const failures = gateFailures(c)
      const sub = subcatById[c.id] !== undefined ? subcatById[c.id] : resolveSubcategory(c)
      return { c, score, failures, sub, ready: isPublishReady(c, sub) }
    })
    const visible = decorated.filter(r => {
      switch (filter) {
        case 'ready': return r.ready
        case 'strong': return (r.score ?? 0) >= 80
        case 'weak': return r.score != null && r.score < 65
        case 'flagged': return r.failures.length > 0
        default: return true
      }
    })
    visible.sort((a, b) => {
      const sa = a.score ?? -1, sb = b.score ?? -1
      return sortDir === 'desc' ? sb - sa : sa - sb
    })
    return visible
  }, [candidates, filter, sortDir, subcatById])

  const counts = useMemo(() => ({
    ready: rows.filter(r => r.ready).length,
    selected: selected.size,
    selectedReady: rows.filter(r => selected.has(r.c.id) && r.ready).length,
    selectedVisible: rows.filter(r => selected.has(r.c.id)).length,
  }), [rows, selected])

  // Keep cursor on a real row as the list changes.
  const cursorIndex = Math.max(0, rows.findIndex(r => r.c.id === cursorId))
  useEffect(() => {
    if (rows.length === 0) { if (cursorId !== null) setCursorId(null); return }
    if (!rows.some(r => r.c.id === cursorId)) setCursorId(rows[0].c.id)
  }, [rows, cursorId])

  // Drop selections that no longer exist in the queue at all.
  useEffect(() => {
    setSelected(prev => {
      const alive = new Set(candidates.map(c => c.id))
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (alive.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [candidates])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1800)
    return () => clearTimeout(t)
  }, [flash])

  const moveCursor = useCallback((delta) => {
    if (rows.length === 0) return
    const next = Math.min(rows.length - 1, Math.max(0, cursorIndex + delta))
    const id = rows[next].c.id
    setCursorId(id)
    rowRefs.current[id]?.scrollIntoView({ block: 'nearest' })
  }, [rows, cursorIndex])

  const publishRow = useCallback((row) => {
    if (!row) return
    if (!row.ready) {
      setFlash(row.c.vertical === 'way'
        ? 'Way candidates publish from the card — press O to open it.'
        : 'Needs a subcategory before it can publish — set it on the row, or press O for the card.')
      return
    }
    onPublishOne(row.c, buildTriagePayload(row.c, subFor(row.c)))
    setSelected(prev => { if (!prev.has(row.c.id)) return prev; const n = new Set(prev); n.delete(row.c.id); return n })
  }, [onPublishOne, subFor])

  const skipRow = useCallback((row) => {
    if (!row) return
    onSkipOne(row.c)
    setSelected(prev => { if (!prev.has(row.c.id)) return prev; const n = new Set(prev); n.delete(row.c.id); return n })
  }, [onSkipOne])

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Keyboard — the board owns review keys while mounted (Z stays global).
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const row = rows[cursorIndex]
      switch (e.key) {
        case 'ArrowDown': case 'j': case 'J':
          e.preventDefault(); moveCursor(1); break
        case 'ArrowUp': case 'k': case 'K':
          e.preventDefault(); moveCursor(-1); break
        case 'x': case 'X': case ' ':
          e.preventDefault(); if (row) toggleSelect(row.c.id); break
        case 'y': case 'Y': case 'ArrowRight':
          e.preventDefault(); publishRow(row); break
        case 'n': case 'N': case 'ArrowLeft':
          e.preventDefault(); skipRow(row); break
        case 'Enter':
          e.preventDefault(); if (row) setExpandedId(prev => prev === row.c.id ? null : row.c.id); break
        case 'o': case 'O':
          e.preventDefault(); if (row) onOpenCard(row.c.id); break
        case 'Escape':
          e.preventDefault(); setSelected(new Set()); setExpandedId(null); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [rows, cursorIndex, moveCursor, toggleSelect, publishRow, skipRow, onOpenCard])

  // Smart selections — they only SELECT; the reviewer still fires the action.
  const selectBest = () => {
    setSelected(new Set(rows.filter(r => r.ready && (r.score ?? 0) >= 85 && r.failures.length === 0).map(r => r.c.id)))
  }
  const selectWeakest = () => {
    setSelected(new Set(rows.filter(r => r.failures.length > 0 || (r.score != null && r.score < 60)).map(r => r.c.id)))
  }

  const bulkPublish = () => {
    const items = rows
      .filter(r => selected.has(r.c.id) && r.ready)
      .map(r => ({ candidate: r.c, payload: buildTriagePayload(r.c, subFor(r.c)) }))
    if (items.length === 0) return
    onBulk('publish', items)
    setSelected(prev => {
      const done = new Set(items.map(i => i.candidate.id))
      return new Set([...prev].filter(id => !done.has(id)))
    })
  }
  const bulkSkip = () => {
    const items = rows.filter(r => selected.has(r.c.id)).map(r => ({ candidate: r.c }))
    if (items.length === 0) return
    onBulk('skip', items)
    setSelected(new Set())
  }

  const btn = (active) => ({
    fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: active ? 600 : 400,
    color: active ? '#fff' : 'var(--color-muted)',
    background: active ? 'var(--color-sage)' : 'var(--color-cream)',
    border: 'none', borderRadius: 100, padding: '4px 11px',
    cursor: 'pointer', transition: 'all 0.15s',
  })

  return (
    <div>
      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        marginBottom: 10,
      }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={btn(filter === f.key)}>
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))}
          title="Flip sort order"
          style={{ ...btn(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          {sortDir === 'desc' ? '↓ Best first' : '↑ Worst first'}
        </button>
        <span style={{ flex: 1 }} />
        {counts.selected === 0 ? (
          <>
            <button onClick={selectBest} title="Select publish-ready candidates scoring 85+ with clean gates" style={btn(false)}>
              Select best
            </button>
            <button onClick={selectWeakest} title="Select candidates failing a gate or scoring under 60" style={btn(false)}>
              Select weakest
            </button>
          </>
        ) : (
          <>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>
              {counts.selected} selected
            </span>
            {counts.selectedReady > 0 && (
              <button onClick={bulkPublish} style={{
                ...btn(true), background: '#4A7C59', fontWeight: 600,
              }}>
                Publish {counts.selectedReady} ready
              </button>
            )}
            <button onClick={bulkSkip} style={{
              ...btn(true), background: '#CC4444', fontWeight: 600,
            }}>
              Skip {counts.selected}
            </button>
            <button onClick={() => setSelected(new Set())} style={btn(false)}>
              Clear
            </button>
          </>
        )}
      </div>

      {/* Key hints + tally */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 12,
        fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)',
      }}>
        <span>
          {rows.length} in view · <span style={{ color: '#4A7C59', fontWeight: 500 }}>{counts.ready} ready to publish</span>
        </span>
        <span style={{ opacity: 0.75 }}>
          ↑↓ move · X select · Y publish · N skip · Enter details · O card · Z undo
        </span>
      </div>

      {flash && (
        <div style={{
          marginBottom: 10, padding: '8px 14px', borderRadius: 8,
          background: '#FFF3E0', border: '1px solid #FFB74D',
          fontFamily: 'var(--font-body)', fontSize: 12, color: '#E65100',
        }}>
          {flash}
        </div>
      )}

      {/* Rows */}
      <div style={{
        background: '#fff', borderRadius: 12,
        border: '1px solid var(--color-border)', overflow: 'hidden',
      }}>
        {rows.length === 0 && (
          <div style={{
            padding: '2.5rem', textAlign: 'center',
            fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
          }}>
            Nothing matches this view — try another filter.
          </div>
        )}
        {rows.map((r, i) => {
          const { c } = r
          const isCursor = c.id === cursorId
          const isSelected = selected.has(c.id)
          const isExpanded = expandedId === c.id
          const vColor = VERTICAL_COLORS[c.vertical] || 'var(--color-muted)'
          return (
            <div key={c.id} ref={el => { rowRefs.current[c.id] = el }}
              style={{
                borderTop: i > 0 ? '1px solid var(--color-cream)' : 'none',
                background: isSelected ? 'rgba(95,138,126,0.07)' : '#fff',
              }}>
              <div
                onClick={(e) => {
                  // Shift-click extends the selection from the last clicked row.
                  if (e.shiftKey && lastClickedIndexRef.current != null) {
                    const [lo, hi] = [Math.min(lastClickedIndexRef.current, i), Math.max(lastClickedIndexRef.current, i)]
                    setSelected(prev => {
                      const next = new Set(prev)
                      for (let k = lo; k <= hi; k++) next.add(rows[k].c.id)
                      return next
                    })
                  } else {
                    toggleSelect(c.id)
                    lastClickedIndexRef.current = i
                  }
                  setCursorId(c.id)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', cursor: 'pointer', userSelect: 'none',
                  boxShadow: isCursor ? 'inset 3px 0 0 var(--color-sage)' : 'none',
                }}
              >
                <input type="checkbox" checked={isSelected} readOnly
                  style={{ margin: 0, accentColor: 'var(--color-sage)', pointerEvents: 'none' }} />
                <ScoreChip score={r.score} />
                {showVertical && (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: vColor, flexShrink: 0,
                  }} title={VERTICAL_NAMES[c.vertical] || c.vertical} />
                )}
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1,
                }}>
                  {c.name}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)',
                  fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', flexShrink: 2, minWidth: 0,
                }}>
                  {[c.region, c.state].filter(Boolean).join(', ') || '—'}
                </span>
                <span style={{ flex: 1 }} />
                <GateFlags failures={r.failures} />
                <RowSubcategorySelect
                  candidate={c}
                  value={r.sub}
                  onChange={v => setSubcatById(prev => ({ ...prev, [c.id]: v }))}
                />
                <button
                  onClick={e => { e.stopPropagation(); setCursorId(c.id); setExpandedId(prev => prev === c.id ? null : c.id) }}
                  title="Details (Enter)"
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                    transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
                    flexShrink: 0,
                  }}>
                  ▸
                </button>
              </div>
              {isExpanded && (
                <RowDetail
                  candidate={c}
                  canPublish={r.ready}
                  onPublish={() => publishRow(r)}
                  onSkip={() => skipRow(r)}
                  onOpenCard={() => onOpenCard(c.id)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
