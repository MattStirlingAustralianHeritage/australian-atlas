'use client'

import { useState, useMemo, useRef } from 'react'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
  way: '#6B7A4A',
}

const SLOT_TYPE_LABELS = { general: 'General', new_producer: 'New Producer' }

function scoreColor(n) {
  if (n == null) return 'var(--color-muted)'
  if (n >= 80) return '#4A7C59'
  if (n >= 60) return '#C49A3C'
  return '#C4634F'
}

// ─── Single pitch card ──────────────────────────────────────
function PitchCard({ pitch, listing, onResolved }) {
  const [status, setStatus] = useState('idle') // idle | keeping | dismissing | error
  const [errorMsg, setErrorMsg] = useState(null)
  const [exiting, setExiting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showReason, setShowReason] = useState(false)
  const [reason, setReason] = useState('')
  const busyRef = useRef(false)

  const color = VERTICAL_COLORS[pitch.vertical] || 'var(--color-muted)'
  const facts = Array.isArray(pitch.verified_facts) ? pitch.verified_facts : []
  const research = Array.isArray(pitch.research_needed) ? pitch.research_needed : []

  const act = async (action) => {
    if (busyRef.current) return
    busyRef.current = true
    setErrorMsg(null)
    setStatus(action === 'keep' ? 'keeping' : 'dismissing')
    try {
      const res = await fetch('/api/admin/pitches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pitchId: pitch.id, reason: action === 'dismiss' ? reason : undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(d.error || 'Action failed')
        setStatus('error')
        busyRef.current = false
        return
      }
      setExiting(true)
      setTimeout(() => onResolved(pitch.id), 460)
    } catch (err) {
      setErrorMsg(err.message || 'Network error')
      setStatus('error')
      busyRef.current = false
    }
  }

  const busy = status === 'keeping' || status === 'dismissing'

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 16,
        background: '#fff',
        overflow: 'hidden',
        transition: 'all 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: exiting ? 0 : 1,
        maxHeight: exiting ? 0 : 4000,
        marginBottom: exiting ? 0 : 24,
        transform: exiting ? 'translateY(-12px) scale(0.98)' : 'translateY(0) scale(1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        border: `1px solid ${color}28`,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 20px', background: 'var(--color-cream)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={{
          padding: '2px 10px', borderRadius: 6, background: color + '1A',
          border: `1px solid ${color}55`, color,
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11,
          letterSpacing: '0.02em',
        }}>
          {VERTICAL_NAMES[pitch.vertical] || pitch.vertical}
        </span>
        <span style={{
          fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
          letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)',
        }}>
          {SLOT_TYPE_LABELS[pitch.slot_type] || pitch.slot_type}
        </span>
        <span style={{ flex: 1 }} />
        {pitch.candidate_score != null && (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11, color: scoreColor(pitch.candidate_score) }}>
            candidate {pitch.candidate_score}
          </span>
        )}
        {pitch.confidence_score != null && (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11, color: scoreColor(pitch.confidence_score) }}>
            confidence {pitch.confidence_score}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '18px 20px 4px' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21,
          color: 'var(--color-ink)', lineHeight: 1.25, margin: '0 0 8px',
        }}>
          {pitch.headline || <span style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>No headline</span>}
        </h2>
        {pitch.angle && (
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.55, margin: '0 0 10px' }}>
            {pitch.angle}
          </p>
        )}
        {pitch.editorial_framing && (
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 12px', fontStyle: 'italic' }}>
            {pitch.editorial_framing}
          </p>
        )}

        {/* Verified facts */}
        {facts.length > 0 && (
          <div style={{ margin: '4px 0 12px', padding: '10px 12px', background: '#FAFAF7', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6 }}>
              Verified facts ({facts.length})
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
              {facts.map((f, i) => (
                <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', lineHeight: 1.5, marginBottom: 3 }}>
                  {typeof f === 'string' ? f : (f.claim || JSON.stringify(f))}
                  {f && typeof f === 'object' && f.field != null && (
                    <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{' '}— {f.field}: {String(f.value)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Source listing */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>Source:</span>
          <span>{listing?.name || pitch.anchor_listing_id || '—'}</span>
          {listing?.region && <span>· {listing.region}</span>}
          {listing?.sub_type && <span>· {listing.sub_type}</span>}
          {listing?.website && (
            <a href={listing.website} target="_blank" rel="noopener noreferrer" style={{ color, textDecoration: 'underline' }}>
              website ↗
            </a>
          )}
        </div>

        {/* Expandable full brief */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color,
            letterSpacing: '0.02em',
          }}
        >
          {expanded ? '▾ Hide full brief' : '▸ View full brief'}
        </button>

        {expanded && (
          <div style={{ margin: '6px 0 12px', padding: 12, background: '#FAFAF7', border: '1px solid var(--color-border)', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)', lineHeight: 1.6 }}>
            {research.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Research needed</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {research.map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
                </ul>
              </div>
            )}
            {listing?.description && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Source description</div>
                <p style={{ margin: 0 }}>{listing.description}</p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11, color: 'var(--color-muted)' }}>
              {Array.isArray(pitch.supporting_listing_ids) && pitch.supporting_listing_ids.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>Supporting listings: {pitch.supporting_listing_ids.join(', ')}</div>
              )}
              {pitch.prompt_version && <div>Prompt: {pitch.prompt_version}</div>}
              {pitch.generated_by && <div>Model: {pitch.generated_by}</div>}
              {pitch.generated_at && <div>Generated: {new Date(pitch.generated_at).toLocaleString()}</div>}
              <div>Pitch ID: {pitch.id}</div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <div style={{ margin: '0 20px 12px', padding: '8px 12px', background: '#FCEDEA', border: '1px solid #C4634F55', borderRadius: 6, fontFamily: 'var(--font-body)', fontSize: 12, color: '#9A3A2A' }}>
          {errorMsg}
        </div>
      )}

      {/* Dismiss reason */}
      {showReason && (
        <div style={{ margin: '0 20px 12px' }}>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional reason for dismissing…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6,
              border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: 13,
            }}
          />
        </div>
      )}

      {/* Footer actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
        borderTop: '1px solid var(--color-border)', background: '#fff',
      }}>
        <button
          onClick={() => act('keep')}
          disabled={busy}
          style={{
            height: 36, padding: '0 18px', borderRadius: 8, border: 'none', cursor: busy ? 'default' : 'pointer',
            background: '#4A7C59', color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
            opacity: busy ? 0.6 : 1, boxShadow: '0 1px 3px rgba(74,124,89,0.3)',
          }}
        >
          {status === 'keeping' ? 'Keeping…' : 'Keep — add to Editorial (In Progress)'}
        </button>

        {!showReason ? (
          <button
            onClick={() => setShowReason(true)}
            disabled={busy}
            style={{
              height: 36, padding: '0 14px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
              background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)',
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, opacity: busy ? 0.6 : 1,
            }}
          >
            Dismiss
          </button>
        ) : (
          <button
            onClick={() => act('dismiss')}
            disabled={busy}
            style={{
              height: 36, padding: '0 16px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
              background: '#C4634F', border: 'none', color: '#fff',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, opacity: busy ? 0.6 : 1,
            }}
          >
            {status === 'dismissing' ? 'Dismissing…' : 'Confirm dismiss'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Queue ──────────────────────────────────────────────────
export default function PitchesQueue({ initialPitches, listingsById, slotSummary }) {
  const [pitches, setPitches] = useState(initialPitches || [])
  const [verticalFilter, setVerticalFilter] = useState('all')

  const onResolved = (id) => setPitches((prev) => prev.filter((p) => p.id !== id))

  const verticals = useMemo(() => {
    const set = new Set(pitches.map((p) => p.vertical))
    return [...set].sort()
  }, [pitches])

  const visible = verticalFilter === 'all' ? pitches : pitches.filter((p) => p.vertical === verticalFilter)

  const slotEntries = Object.entries(slotSummary || {}).sort()
  const totalFilled = slotEntries.reduce((a, [, v]) => a + v.filled, 0)
  const totalSlots = slotEntries.reduce((a, [, v]) => a + v.total, 0)

  return (
    <div>
      {/* Slot-fill summary */}
      <div style={{
        marginBottom: 20, padding: '12px 16px', borderRadius: 10,
        background: 'var(--color-cream)', border: '1px solid var(--color-border)',
        fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)',
      }}>
        <strong style={{ color: 'var(--color-ink)' }}>{totalFilled}</strong> of {totalSlots} slots filled across the network · <strong style={{ color: 'var(--color-ink)' }}>{pitches.length}</strong> awaiting triage
      </div>

      {/* Vertical filter */}
      {verticals.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          {['all', ...verticals].map((v) => {
            const active = verticalFilter === v
            const c = v === 'all' ? 'var(--color-ink)' : (VERTICAL_COLORS[v] || 'var(--color-ink)')
            return (
              <button
                key={v}
                onClick={() => setVerticalFilter(v)}
                style={{
                  padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${active ? c : 'var(--color-border)'}`,
                  background: active ? c + '18' : '#fff', color: active ? c : 'var(--color-muted)',
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12,
                }}
              >
                {v === 'all' ? `All (${pitches.length})` : `${VERTICAL_NAMES[v] || v} (${pitches.filter((p) => p.vertical === v).length})`}
              </button>
            )
          })}
        </div>
      )}

      {/* Cards */}
      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
          No pitches awaiting triage.
        </div>
      ) : (
        visible.map((p) => (
          <PitchCard
            key={p.id}
            pitch={p}
            listing={listingsById?.[p.anchor_listing_id] || null}
            onResolved={onResolved}
          />
        ))
      )}
    </div>
  )
}
