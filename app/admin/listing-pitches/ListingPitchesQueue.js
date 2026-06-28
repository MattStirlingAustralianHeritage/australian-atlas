'use client'

import { useState, useMemo } from 'react'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

// Admin workflow states. Order matters — it's the action row order too.
const STATUS_META = {
  new:       { label: 'New',        bg: '#fbf3e3', fg: '#8a6d1f' },
  reviewing: { label: 'Reviewing',  bg: '#eaf1f6', fg: '#2f5a73' },
  accepted:  { label: 'Accepted',   bg: '#eef6f0', fg: '#2f7a5e' },
  published: { label: 'Published',  bg: '#e7f0ea', fg: '#246048' },
  declined:  { label: 'Declined',   bg: '#f3f1ef', fg: '#7a736b' },
}
const STATUS_ORDER = ['new', 'reviewing', 'accepted', 'published', 'declined']

const FILTERS = [
  { key: 'open', label: 'Open' },     // new + reviewing + accepted
  { key: 'all', label: 'All' },
  ...STATUS_ORDER.map(s => ({ key: s, label: STATUS_META[s].label })),
]

function fmtDate(v) {
  if (!v) return ''
  try { return new Date(v).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return '' }
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.new
  return (
    <span style={{
      display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 999,
      fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600,
      background: m.bg, color: m.fg, whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  )
}

function PitchCard({ pitch, listing, onPatch }) {
  const [notes, setNotes] = useState(pitch.admin_notes || '')
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const dirty = (notes || '') !== (pitch.admin_notes || '')

  const name = pitch.listing_name || listing?.name || 'Unknown listing'
  const vertical = VERTICAL_LABELS[pitch.vertical] || pitch.vertical
  const where = listing ? [listing.suburb || listing.region, listing.state].filter(Boolean).join(', ') : ''

  async function setStatus(status) {
    if (status === pitch.status) return
    await onPatch(pitch.id, { status })
  }
  async function saveNotes() {
    setSaving(true)
    await onPatch(pitch.id, { admin_notes: notes })
    setSaving(false); setSavedNote(true)
    setTimeout(() => setSavedNote(false), 1800)
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12,
      padding: '1.25rem 1.4rem', marginBottom: '0.9rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, color: 'var(--color-ink)', margin: 0 }}>
              {name}
            </h3>
            {vertical && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-sage, #5f8a7e)', background: 'var(--color-cream, #FAF8F5)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '2px 8px' }}>
                {vertical}
              </span>
            )}
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.3rem 0 0' }}>
            {where && <>{where} · </>}
            {pitch.submitted_by_email || 'unknown'} · {fmtDate(pitch.created_at)}
          </p>
        </div>
        <StatusBadge status={pitch.status} />
      </div>

      {/* The pitch */}
      <div style={{
        marginTop: '0.9rem', background: 'var(--color-cream, #FAF8F5)', border: '1px solid var(--color-border)',
        borderRadius: 10, padding: '0.9rem 1rem',
      }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--color-ink)', margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {pitch.angle}
        </p>
      </div>

      {/* Links + contact */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: '0.75rem', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
        {pitch.listing_id && (
          <a href={`/admin/listings/${pitch.listing_id}/edit`} style={{ color: 'var(--color-sage, #4A7C59)', textDecoration: 'none' }}>Edit listing →</a>
        )}
        {listing?.slug && (
          <a href={`/place/${listing.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-sage, #4A7C59)', textDecoration: 'none' }}>View on site ↗</a>
        )}
        {pitch.contact_email && (
          <a href={`mailto:${pitch.contact_email}?subject=${encodeURIComponent('Your Atlas Journal story pitch — ' + name)}`} style={{ color: 'var(--color-sage, #4A7C59)', textDecoration: 'none' }}>
            Email {pitch.contact_email} →
          </a>
        )}
      </div>

      {/* Status actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: '1rem' }}>
        {STATUS_ORDER.map(s => {
          const active = s === pitch.status
          const m = STATUS_META[s]
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              disabled={active}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.74rem', fontWeight: 600,
                padding: '0.35rem 0.7rem', borderRadius: 7, cursor: active ? 'default' : 'pointer',
                border: `1px solid ${active ? 'transparent' : 'var(--color-border)'}`,
                background: active ? m.bg : '#fff',
                color: active ? m.fg : 'var(--color-ink)',
                opacity: active ? 1 : 0.9,
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Admin notes */}
      <div style={{ marginTop: '0.9rem' }}>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Internal notes (commissioned to…, follow-up, why declined…)"
          maxLength={2000}
          style={{
            width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-body)', fontSize: '0.82rem',
            padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-border)',
            resize: 'vertical', color: 'var(--color-ink)', background: '#fff', outline: 'none',
          }}
        />
        {(dirty || savedNote) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: '0.5rem' }}>
            <button
              onClick={saveNotes}
              disabled={saving || !dirty}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600,
                padding: '0.4rem 0.9rem', borderRadius: 7, border: 'none',
                background: !dirty ? '#cbd5cb' : 'var(--color-ink)', color: '#fff',
                cursor: saving || !dirty ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save notes'}
            </button>
            {savedNote && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-sage, #2f7a5e)' }}>Saved ✓</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ListingPitchesQueue({ initialPitches, listingsById }) {
  const [pitches, setPitches] = useState(initialPitches || [])
  const [filter, setFilter] = useState('open')
  const [error, setError] = useState(null)

  async function onPatch(id, patch) {
    setError(null)
    // optimistic
    const prev = pitches
    setPitches(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)))
    try {
      const r = await fetch('/api/admin/listing-pitches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Update failed')
      }
      const { pitch } = await r.json()
      if (pitch) setPitches(ps => ps.map(p => (p.id === id ? pitch : p)))
    } catch (e) {
      setPitches(prev) // roll back
      setError(e.message || 'Update failed')
    }
  }

  const counts = useMemo(() => {
    const c = { all: pitches.length, open: 0 }
    for (const s of STATUS_ORDER) c[s] = 0
    for (const p of pitches) {
      if (c[p.status] !== undefined) c[p.status]++
      if (['new', 'reviewing', 'accepted'].includes(p.status)) c.open++
    }
    return c
  }, [pitches])

  const visible = useMemo(() => {
    if (filter === 'all') return pitches
    if (filter === 'open') return pitches.filter(p => ['new', 'reviewing', 'accepted'].includes(p.status))
    return pitches.filter(p => p.status === filter)
  }, [pitches, filter])

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600,
                padding: '0.4rem 0.85rem', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--color-ink)' : 'var(--color-border)'}`,
                background: active ? 'var(--color-ink)' : '#fff',
                color: active ? '#fff' : 'var(--color-ink)',
              }}
            >
              {f.label} <span style={{ opacity: 0.6 }}>{counts[f.key] ?? 0}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#c62828', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1rem', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: '3rem 2rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-ink)', margin: '0 0 0.4rem' }}>
            {pitches.length === 0 ? 'No story pitches yet' : 'Nothing in this view'}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0 }}>
            {pitches.length === 0
              ? 'When an operator pitches a story from their dashboard Editorial page, it lands here.'
              : 'Try a different filter above.'}
          </p>
        </div>
      ) : (
        visible.map(p => (
          <PitchCard key={p.id} pitch={p} listing={listingsById?.[p.listing_id]} onPatch={onPatch} />
        ))
      )}
    </div>
  )
}
