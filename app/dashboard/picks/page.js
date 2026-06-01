'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

export default function DashboardPicks() {
  const [outgoing, setOutgoing] = useState([])
  const [incoming, setIncoming] = useState([])
  const [myListings, setMyListings] = useState([])
  const [maxPicks, setMaxPicks] = useState(5)
  const [curatorId, setCuratorId] = useState(null)
  const [ownsListings, setOwnsListings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/picks')
      const data = await r.json()
      setOutgoing(data.outgoing || [])
      setIncoming(data.incoming || [])
      setMyListings(data.myListings || [])
      setMaxPicks(data.maxPicks || 5)
      setOwnsListings(!!data.ownsListings)
      setCuratorId(prev => prev || data.myListings?.[0]?.id || null)
    } catch {
      setError('Could not load your picks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const myOutgoing = outgoing.filter(p => p.curatorId === curatorId)
  const remaining = maxPicks - myOutgoing.length

  const removePick = async (id) => {
    setOutgoing(prev => prev.filter(p => p.id !== id))
    await fetch(`/api/dashboard/picks?id=${id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
          {"Producer's Picks"}
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0 }}>
          Vouch for up to {maxPicks} other venues in the Atlas network. Your picks appear on your public listing.
        </p>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#c62828', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Curator selector when the operator owns more than one listing */}
      {myListings.length > 1 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '0.4rem' }}>
            Picking on behalf of
          </label>
          <select value={curatorId || ''} onChange={e => setCuratorId(e.target.value)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)', minWidth: 240 }}>
            {myListings.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({VERTICAL_LABELS[l.vertical] || l.vertical})</option>
            ))}
          </select>
        </div>
      )}

      {/* Your Picks (outgoing) */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: 0 }}>
            Your Picks
          </h2>
          {curatorId && (
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: remaining <= 0 ? '#c62828' : 'var(--color-muted)' }}>
              {myOutgoing.length} / {maxPicks}
            </span>
          )}
        </div>

        {loading ? (
          <SkeletonCard />
        ) : !curatorId ? (
          ownsListings ? (
            <EmptyState
              title="A Standard feature"
              body="Producer's Picks lets your venue recommend up to five others in the network. Upgrade a listing to Standard to start vouching."
              cta={
                <Link href="/dashboard/subscription" style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '0.82rem', fontWeight: 600, padding: '0.5rem 1.1rem', borderRadius: 8, background: 'var(--color-sage, #4A7C59)', color: '#fff', textDecoration: 'none' }}>
                  Upgrade to Standard
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No claimed listing yet"
              body="Producer's Picks lets your venue recommend others in the network. Claim your listing to start vouching for the producers, cafes, and stays you rate."
            />
          )
        ) : (
          <>
            {myOutgoing.length === 0 ? (
              <EmptyState
                title="No picks yet"
                body={`Add up to ${maxPicks} venues you personally vouch for. They'll appear on your public listing as your Producer's Picks.`}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                {myOutgoing.map(pick => (
                  <div key={pick.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--color-ink)', margin: '0 0 0.15rem', fontWeight: 500 }}>
                        {pick.pickedName}
                      </p>
                      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: 0 }}>
                        {pick.note || [VERTICAL_LABELS[pick.pickedVertical] || pick.pickedVertical, pick.pickedRegion].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button onClick={() => removePick(pick.id)}
                      style={{ flexShrink: 0, background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-muted)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'var(--font-sans)', padding: '0.3rem 0.6rem' }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {remaining > 0 && (
              <AddPick
                curatorId={curatorId}
                existingPickedIds={myOutgoing.map(p => p.pickedId)}
                onAdded={load}
              />
            )}
          </>
        )}
      </div>

      {/* Picked by Others (incoming) */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '0 0 0.75rem' }}>
          Picked by Others
        </h2>
        {loading ? (
          <SkeletonCard />
        ) : incoming.length === 0 ? (
          <EmptyState title="No incoming picks yet" body="When other venues in the Atlas network vouch for your venue, it will appear here." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {incoming.map(pick => (
              <div key={pick.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.25rem' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', color: 'var(--color-accent)', margin: '0 0 0.375rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Picked by {pick.curatorName}
                </p>
                {pick.note && (
                  <p style={{ fontFamily: 'var(--font-serif)', fontSize: '0.9rem', color: 'var(--color-ink)', margin: '0 0 0.25rem', fontStyle: 'italic' }}>
                    &ldquo;{pick.note}&rdquo;
                  </p>
                )}
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--color-muted)', margin: 0 }}>
                  {pick.pickedName} · {VERTICAL_LABELS[pick.pickedVertical] || pick.pickedVertical}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Add-a-pick: search + optional note + submit ─────────────
function AddPick({ curatorId, existingPickedIds, onAdded }) {
  const [open, setOpen] = useState(false)
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
        const r = await fetch(`/api/dashboard/picks/search?q=${encodeURIComponent(query)}&exclude=${curatorId}`)
        const data = await r.json()
        setResults((data.results || []).filter(v => !existingPickedIds.includes(v.id)))
      } catch { setResults([]) } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [query, curatorId, selected, existingPickedIds])

  const reset = () => { setOpen(false); setQuery(''); setResults([]); setSelected(null); setNote(''); setError(null) }

  const submit = async () => {
    if (!selected || submitting) return
    setSubmitting(true); setError(null)
    try {
      const r = await fetch('/api/dashboard/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curatorListingId: curatorId, pickedListingId: selected.id, note: note.trim() || null }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not add pick'); return }
      reset(); onAdded()
    } catch { setError('Network error') } finally { setSubmitting(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-sage, #4A7C59)', background: '#fff', border: '1px dashed var(--color-border)', borderRadius: 10, padding: '0.7rem 1rem', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        {"+ Add a producer's pick"}
      </button>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
      {!selected ? (
        <>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search venues by name…"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
          {searching && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.6rem 0 0' }}>Searching…</p>}
          {results.length > 0 && (
            <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {results.map(v => (
                <button key={v.id} onClick={() => { setSelected(v); setResults([]); setQuery(v.name) }}
                  style={{ textAlign: 'left', background: 'none', border: 'none', borderRadius: 6, padding: '0.5rem 0.6rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-cream, #FAF8F5)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--color-ink)' }}>{v.name}</span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--color-muted)', marginLeft: 8 }}>
                    {[VERTICAL_LABELS[v.vertical] || v.vertical, v.region].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--color-ink)', margin: '0 0 0.5rem', fontWeight: 500 }}>
            {selected.name}
            <button onClick={() => { setSelected(null); setQuery('') }}
              style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>
              change
            </button>
          </p>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={280}
            placeholder="Optional: why do you vouch for them? (shown publicly)"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', width: '100%', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
        </>
      )}

      {error && <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: '#c62828', margin: '0.6rem 0 0' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
        <button onClick={submit} disabled={!selected || submitting}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600, padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', background: !selected ? '#cbd5cb' : 'var(--color-sage, #4A7C59)', color: '#fff', cursor: !selected || submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Adding…' : 'Add pick'}
        </button>
        <button onClick={reset}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', padding: '0.5rem 0.9rem', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function EmptyState({ title, body, cta }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '2rem', textAlign: 'center' }}>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', color: 'var(--color-ink)', margin: '0 0 0.375rem' }}>{title}</p>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.825rem', color: 'var(--color-muted)', margin: '0 auto', maxWidth: 460 }}>{body}</p>
      {cta && <div style={{ marginTop: '1.25rem' }}>{cta}</div>}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem' }}>
      <div style={{ width: '50%', height: 12, background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.75rem' }} />
      <div style={{ width: '30%', height: 10, background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}
