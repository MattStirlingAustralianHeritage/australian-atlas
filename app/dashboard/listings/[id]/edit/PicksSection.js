'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getVerticalLabel, getVerticalBrandColour } from '@/lib/verticalUrl'

/**
 * Producer Picks manager for the listing editor (paid perk).
 *
 * Lets an operator vouch for fellow producers: search the network, pick a
 * venue, and add a short (50-word) write-up. Reuses the cookie-authenticated
 * /api/dashboard/picks endpoints — the editor runs inside a Supabase session, so
 * the cookie authorises ownership (an active claim on this listing). The 50-word
 * cap is enforced here for UX and clamped authoritatively in createPick().
 */

const MAX_WORDS = 50

function countWords(s) {
  const t = (s || '').trim()
  return t ? t.split(/\s+/).length : 0
}
function clampWords(s, max) {
  const parts = (s || '').trim().split(/\s+/).filter(Boolean)
  return parts.length <= max ? s : parts.slice(0, max).join(' ')
}

const ICONS = {
  star: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
}

export default function PicksSection({ listingId, token, isPaid, listing }) {
  const [picks, setPicks] = useState([])
  const [maxPicks, setMaxPicks] = useState(5)
  const [owns, setOwns] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const blurTimer = useRef(null)

  const load = useCallback(() => {
    fetch('/api/dashboard/picks')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); setLoading(false); return }
        setMaxPicks(data.maxPicks || 5)
        setOwns((data.myListings || []).some(l => l.id === listingId))
        setPicks((data.outgoing || []).filter(p => p.curatorId === listingId))
        setLoading(false)
      })
      .catch(() => { setLoadError('Failed to load producer picks'); setLoading(false) })
  }, [listingId])

  useEffect(() => {
    if (!isPaid) { setLoading(false); return }
    load()
  }, [isPaid, load])

  // Debounced venue search.
  useEffect(() => {
    if (selected) return
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/dashboard/picks/search?q=${encodeURIComponent(q)}&exclude=${encodeURIComponent(listingId)}`)
        .then(r => r.json())
        .then(data => { if (active) { setResults(data.results || []); setSearching(false) } })
        .catch(() => { if (active) setSearching(false) })
    }, 220)
    return () => { active = false; clearTimeout(t) }
  }, [query, selected, listingId])

  const pickedIds = new Set(picks.map(p => p.pickedId))
  const atCap = picks.length >= maxPicks
  const words = countWords(note)
  const overLimit = words > MAX_WORDS

  async function addPick() {
    if (!selected) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/dashboard/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curatorListingId: listingId, pickedListingId: selected.id, note: note.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error || 'Could not add pick'); setAdding(false); return }
      setPicks(prev => [...prev, data.pick])
      setSelected(null); setNote(''); setQuery(''); setResults([])
    } catch { setAddError('Could not add pick') }
    finally { setAdding(false) }
  }

  async function removePick(p) {
    if (typeof window !== 'undefined' && !window.confirm(`Remove your pick of ${p.pickedName}?`)) return
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/dashboard/picks?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' })
      if (res.ok) setPicks(prev => prev.filter(x => x.id !== p.id))
    } catch { /* ignore */ }
    finally { setBusyId(null) }
  }

  const picksLabel = listing?.vertical === 'fine_grounds' ? "Roaster's picks" : 'Producer picks'

  // ── Non-paid lock card ──
  if (!isPaid) {
    return (
      <Section title={picksLabel}>
        <div style={lockCard}>
          <span style={{ display: 'inline-flex', color: 'var(--color-sage)', flexShrink: 0 }}>{ICONS.star}</span>
          <div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Vouch for fellow producers</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              Producer picks are part of a paid listing. Recommend the makers and venues you admire — they appear on your public page.
            </p>
            <a href="/dashboard/subscription" style={{ display: 'inline-block', marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textDecoration: 'none' }}>View subscription options →</a>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <Section title={picksLabel} count={picks.length} max={maxPicks}>
      <style>{`
        .aa-pick-result:hover { background: var(--color-cream) !important; }
        .aa-pick-card { transition: box-shadow 0.12s ease; }
        .aa-pick-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
      `}</style>
      <p style={helpText}>
        Recommend up to {maxPicks} fellow producers you admire, each with a short note on why. Your picks appear on your public listing and link visitors to those venues.
      </p>

      {loadError && <div style={errBox}>{loadError}</div>}

      {loading ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Loading picks…</p>
      ) : !owns ? (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', padding: '12px 14px', borderRadius: 8, background: 'var(--color-cream)', border: '1px solid var(--color-border)', lineHeight: 1.5 }}>
          Producer picks become available once your claim on this listing is active. If you’ve just upgraded, check back shortly.
        </div>
      ) : (
        <>
          {/* Existing picks */}
          {picks.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: picks.length ? 18 : 0 }}>
              {picks.map(p => {
                const c = getVerticalBrandColour(p.pickedVertical) || 'var(--color-sage)'
                return (
                  <div key={p.id} className="aa-pick-card" style={{ ...pickCard, borderTop: `3px solid ${c}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)', lineHeight: 1.25 }}>{p.pickedName}</div>
                        <div style={{ marginTop: 3, fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: c }}>
                          {getVerticalLabel(p.pickedVertical) || ''}{p.pickedRegion ? ` · ${p.pickedRegion}` : ''}
                        </div>
                      </div>
                      <button type="button" onClick={() => removePick(p)} disabled={busyId === p.id} aria-label="Remove pick" style={iconBtn}>{ICONS.trash}</button>
                    </div>
                    {p.note && <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5 }}>{p.note}</p>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add a pick */}
          {atCap ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>You’ve used all {maxPicks} of your producer picks. Remove one to add another.</p>
          ) : selected ? (
            <div style={composer}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Picking</span>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--color-ink)' }}>{selected.name}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{getVerticalLabel(selected.vertical) || ''}{selected.region ? ` · ${selected.region}` : ''}</div>
                </div>
                <button type="button" onClick={() => { setSelected(null); setNote(''); setAddError(null) }} aria-label="Choose a different venue" style={iconBtn}>{ICONS.close}</button>
              </div>
              <textarea
                value={note}
                onChange={e => setNote(clampWords(e.target.value, MAX_WORDS + 10))}
                rows={3}
                placeholder={`Why do you recommend ${selected.name}? (up to ${MAX_WORDS} words)`}
                style={{ ...input, resize: 'vertical', lineHeight: 1.5 }}
              />
              {addError && <div style={{ ...errBox, marginTop: 10, marginBottom: 0 }}>{addError}</div>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: overLimit ? '#c62828' : 'var(--color-muted)' }}>{words} / {MAX_WORDS} words</span>
                <button type="button" onClick={addPick} disabled={adding || overLimit} style={{ ...saveBtn, opacity: (adding || overLimit) ? 0.6 : 1 }}>{adding ? 'Adding…' : 'Add pick'}</button>
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative', maxWidth: 460 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 10, background: '#fff' }}>
                <span style={{ color: 'var(--color-muted)', display: 'inline-flex' }}>{ICONS.search}</span>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onBlur={() => { blurTimer.current = setTimeout(() => setResults([]), 150) }}
                  onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current) }}
                  placeholder="Search for a producer or venue to pick…"
                  style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', background: 'transparent' }}
                />
                {searching && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>…</span>}
              </div>
              {results.length > 0 && (
                <div style={dropdown}>
                  {results.map(r => {
                    const already = pickedIds.has(r.id)
                    const c = getVerticalBrandColour(r.vertical) || 'var(--color-sage)'
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="aa-pick-result"
                        disabled={already}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { if (!already) { setSelected(r); setResults([]); setQuery('') } }}
                        style={{ ...resultRow, cursor: already ? 'default' : 'pointer', opacity: already ? 0.5 : 1 }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{getVerticalLabel(r.vertical) || ''}{r.region ? ` · ${r.region}` : ''}</span>
                        </span>
                        {already && <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>Picked</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

function Section({ title, count, max, children }) {
  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>{title}</h2>
        {typeof count === 'number' && typeof max === 'number' && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{count} / {max}</span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── styles ──
const helpText = { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 16px', lineHeight: 1.5 }
const errBox = { marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 13 }
const lockCard = { display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }
const pickCard = { padding: 14, borderRadius: 12, border: '1px solid var(--color-border)', background: '#fff' }
const composer = { padding: 16, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', maxWidth: 520 }
const input = { width: '100%', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const dropdown = { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }
const resultRow = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', background: 'transparent' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', cursor: 'pointer', flexShrink: 0 }
const saveBtn = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--color-ink)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
