'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const label = {
  display: 'block', fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6,
}
const input = {
  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
  border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 10px',
  background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
}

// Producer-picks management inside the admin Listing Editor.
// Primary control = "Picked by" (incoming): record that another venue has
// given THIS listing a producer pick. Also lists this listing's own outgoing
// picks so the full graph is visible; admin may remove any row.
export default function ListingPicksEditor({ listingId, listingName }) {
  const [receivedFrom, setReceivedFrom] = useState([])
  const [given, setGiven] = useState([])
  const [maxPicks, setMaxPicks] = useState(5)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/listings/${listingId}/picks`)
      if (!r.ok) throw new Error()
      const data = await r.json()
      setReceivedFrom(data.receivedFrom || [])
      setGiven(data.given || [])
      setMaxPicks(data.maxPicks || 5)
    } catch { /* leave empty */ } finally { setLoading(false) }
  }, [listingId])

  useEffect(() => { load() }, [load])

  const removeRel = async (relId, which) => {
    if (which === 'in') setReceivedFrom(prev => prev.filter(p => p.id !== relId))
    else setGiven(prev => prev.filter(p => p.id !== relId))
    await fetch(`/api/admin/listings/${listingId}/picks?relId=${relId}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, marginTop: 10 }}>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A6B8A', marginBottom: 4 }}>
        {"Producer's Picks"}
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Record that another venue has vouched for <strong>{listingName}</strong>, or remove an existing pick.
      </p>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>Loading picks…</p>
      ) : (
        <>
          {/* ── Picked by (incoming) ── */}
          <label style={label}>Picked by</label>
          {receivedFrom.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: '0 0 10px', fontStyle: 'italic' }}>
              No venues have picked this listing yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {receivedFrom.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', fontWeight: 500 }}>
                      {p.curatorName}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', marginLeft: 6 }}>
                      {VERTICAL_LABELS[p.curatorVertical] || p.curatorVertical}
                      {p.source === 'manual' ? ' · admin' : ''}
                    </span>
                    {p.note && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', margin: '2px 0 0', fontStyle: 'italic' }}>
                        &ldquo;{p.note}&rdquo;
                      </p>
                    )}
                  </div>
                  <button onClick={() => removeRel(p.id, 'in')} title="Remove pick"
                    style={{ flexShrink: 0, background: 'none', border: 'none', color: '#c53030', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          <AddPickedBy listingId={listingId} excludeIds={[listingId, ...receivedFrom.map(p => p.curatorId)]} maxPicks={maxPicks} onAdded={load} />

          {/* ── This listing's own picks (outgoing) — context, removable ── */}
          {given.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label style={label}>{listingName} picks ({given.length}/{maxPicks})</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {given.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#FAFAF6', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 10px' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)' }}>
                      {p.pickedName}
                      <span style={{ color: 'var(--color-muted)', marginLeft: 6, fontSize: 11 }}>
                        {VERTICAL_LABELS[p.pickedVertical] || p.pickedVertical}
                      </span>
                    </span>
                    <button onClick={() => removeRel(p.id, 'out')} title="Remove pick"
                      style={{ flexShrink: 0, background: 'none', border: 'none', color: '#c53030', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Search a venue and record it as having picked this listing.
function AddPickedBy({ listingId, excludeIds, maxPicks, onAdded }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (selected || query.trim().length < 2) { setResults([]); return }
    clearTimeout(debounceRef.current)
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/listings?search=${encodeURIComponent(query)}&limit=8`)
        const data = await r.json()
        setResults((data.listings || []).filter(v => !excludeIds.includes(v.id)))
      } catch { setResults([]) } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [query, selected, excludeIds])

  const submit = async () => {
    if (!selected || submitting) return
    setSubmitting(true); setError(null)
    try {
      const r = await fetch(`/api/admin/listings/${listingId}/picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickerListingId: selected.id, note: note.trim() || null }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not add pick'); return }
      setQuery(''); setResults([]); setSelected(null); setNote('')
      onAdded()
    } catch { setError('Network error') } finally { setSubmitting(false) }
  }

  return (
    <div style={{ background: '#fff', border: '1px dashed var(--color-border)', borderRadius: 8, padding: '10px 12px' }}>
      {!selected ? (
        <>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the venue that picked this listing…" style={input} />
          {searching && <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', margin: '6px 0 0' }}>Searching…</p>}
          {results.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflowY: 'auto' }}>
              {results.map(v => (
                <button key={v.id} onClick={() => { setSelected(v); setResults([]); setQuery(v.name) }}
                  style={{ textAlign: 'left', background: 'none', border: 'none', borderRadius: 5, padding: '6px 8px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-cream, #FAF8F5)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>{v.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 6 }}>
                    {[VERTICAL_LABELS[v.vertical] || v.vertical, v.region].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', margin: '0 0 6px', fontWeight: 500 }}>
            Picked by {selected.name}
            <button onClick={() => { setSelected(null); setQuery('') }}
              style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-sage)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
              change
            </button>
          </p>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={280}
            placeholder="Optional note (shown publicly)" style={input} />
        </>
      )}

      {error && <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#c53030', margin: '6px 0 0' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={submit} disabled={!selected || submitting}
          style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '6px 14px', borderRadius: 6, border: 'none', background: !selected ? '#cbd5cb' : 'var(--color-sage)', color: '#fff', cursor: !selected || submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Adding…' : 'Add pick'}
        </button>
      </div>
    </div>
  )
}
