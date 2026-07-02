'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TradeFields from '@/components/trade/TradeFields'
import { ATLAS_ATTRIBUTION } from '@/lib/trade/config'
import { legBetween } from '@/lib/trade/distance'

/**
 * Atlas Trade builder v2 — day-planned proposals over the curated network.
 *
 * What's new over v1:
 *   - Day structure: assign each stop to a day; day headers + per-leg
 *     drive estimates (approximate, straight-line based) in the sidebar.
 *   - Proposal framing: client name ("Prepared for …") + cover note.
 *   - Draft persistence + AUTO-SAVE: the work survives a closed tab — the
 *     complaint that follows every itinerary tool that lacks it.
 *   - Edit an existing itinerary (?id=…) and start from a directory
 *     shortlist handoff (?from=directory, via sessionStorage).
 */
export default function TradeBuilderClient({ account }) {
  const router = useRouter()

  // Search state
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [detectedRegion, setDetectedRegion] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Itinerary state
  const [itineraryId, setItineraryId] = useState(null)
  const [status, setStatus] = useState('draft')
  const [slug, setSlug] = useState(null)
  const [stops, setStops] = useState([]) // ordered; each: {listing_id, name, meta…, day, time_hint, notes}
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [coverNote, setCoverNote] = useState('')
  const [dayCount, setDayCount] = useState(1)

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState(null)
  const [loadingExisting, setLoadingExisting] = useState(false)

  const stopIds = new Set(stops.map((s) => s.listing_id))
  const autosaveRef = useRef(null)
  const hydratedRef = useRef(false)

  // ── Entry modes: edit existing (?id=) or directory handoff (?from=directory).
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    if (id) {
      setLoadingExisting(true)
      fetch(`/api/trade/itinerary/${id}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.itinerary) return
          setItineraryId(data.itinerary.id)
          setStatus(data.itinerary.status)
          setSlug(data.itinerary.slug)
          setTitle(data.itinerary.title || '')
          setClientName(data.itinerary.client_name || '')
          setCoverNote(data.itinerary.cover_note || '')
          setQuery(data.itinerary.intent_text || '')
          setRegion(data.itinerary.region || '')
          const loaded = (data.stops || []).map((s) => ({
            listing_id: s.listing_id,
            name: s.name,
            vertical_label: s.vertical_label,
            sub_type: s.sub_type,
            region: s.region,
            suburb: s.suburb,
            state: s.state,
            lat: s.lat,
            lng: s.lng,
            trade_ready: s.trade_ready,
            trade: s.trade,
            day: s.day || 1,
            time_hint: s.time_hint || '',
            notes: s.notes || '',
          }))
          setStops(loaded)
          setDayCount(Math.max(1, ...loaded.map((s) => s.day)))
        })
        .finally(() => setLoadingExisting(false))
    } else if (params.get('from') === 'directory') {
      try {
        const picks = JSON.parse(sessionStorage.getItem('atlas-trade-picks') || '[]')
        if (Array.isArray(picks) && picks.length) {
          setStops(picks.map((p) => ({
            listing_id: p.id, name: p.name, vertical_label: p.vertical_label,
            sub_type: p.sub_type, region: p.region, suburb: p.suburb, state: p.state,
            lat: p.lat, lng: p.lng, trade_ready: !!p.trade_ready, trade: p.trade || null,
            day: 1, time_hint: '', notes: '',
          })))
          const r = picks.find((p) => p.region)?.region
          if (r) setRegion(r)
        }
        sessionStorage.removeItem('atlas-trade-picks')
      } catch { /* a broken handoff should never break the builder */ }
    }
  }, [])

  const runSearch = useCallback(async (e) => {
    if (e) e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    setHasSearched(true)
    try {
      const res = await fetch('/api/trade/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), region: region.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setCandidates(data.candidates || [])
      setDetectedRegion(data.detectedRegion || null)
      if (!title.trim() && query.trim()) {
        const r = data.detectedRegion?.name || region.trim()
        setTitle(r ? `${capitalise(query.trim())} — ${r}` : capitalise(query.trim()))
      }
    } catch (err) {
      setSearchError(err.message)
      setCandidates([])
    } finally {
      setSearching(false)
    }
  }, [query, region, title])

  function addStop(c) {
    if (stopIds.has(c.listing_id || c.id)) return
    setStops((prev) => [...prev, { ...c, listing_id: c.id, day: dayCount, time_hint: '', notes: '' }])
  }
  function removeStop(id) {
    setStops((prev) => prev.filter((s) => s.listing_id !== id))
  }
  function move(idx, dir) {
    setStops((prev) => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  function patchStop(id, patch) {
    setStops((prev) => prev.map((s) => (s.listing_id === id ? { ...s, ...patch } : s)))
  }
  function addDay() {
    setDayCount((d) => Math.min(60, d + 1))
  }

  const payload = useCallback((forStatus) => ({
    title: title.trim() || 'Untitled itinerary',
    intent_text: query.trim() || null,
    region: detectedRegion?.name || region.trim() || null,
    client_name: clientName.trim() || null,
    cover_note: coverNote.trim() || null,
    status: forStatus,
    stops: stops.map((s) => ({
      listing_id: s.listing_id,
      day: s.day || 1,
      time_hint: s.time_hint || null,
      notes: s.notes || null,
    })),
  }), [title, query, region, detectedRegion, clientName, coverNote, stops])

  const saveDraft = useCallback(async (silent = false) => {
    if (stops.length === 0 && !title.trim()) return null
    if (!silent) setSaving(true)
    try {
      let res
      if (itineraryId) {
        res = await fetch(`/api/trade/itinerary/${itineraryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload(status === 'published' ? 'published' : 'draft')),
        })
      } else {
        res = await fetch('/api/trade/itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload('draft')),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      if (!itineraryId) {
        setItineraryId(data.id)
        setSlug(data.slug)
      }
      setSavedAt(new Date())
      return data
    } catch (err) {
      if (!silent) setPublishError(err.message)
      return null
    } finally {
      if (!silent) setSaving(false)
    }
  }, [itineraryId, payload, status, stops.length, title])

  // ── Auto-save: once a draft exists, changes persist themselves (2.5s idle).
  useEffect(() => {
    if (!itineraryId || status === 'published') return
    clearTimeout(autosaveRef.current)
    autosaveRef.current = setTimeout(() => { saveDraft(true) }, 2500)
    return () => clearTimeout(autosaveRef.current)
  }, [itineraryId, status, saveDraft])

  async function publish() {
    setPublishError(null)
    if (stops.length === 0) { setPublishError('Add at least one stop first.'); return }
    if (!title.trim()) { setPublishError('Give the itinerary a title.'); return }
    setPublishing(true)
    try {
      let data
      if (itineraryId) {
        const res = await fetch(`/api/trade/itinerary/${itineraryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload('published')),
        })
        data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not publish')
        router.push(data.url)
      } else {
        const res = await fetch('/api/trade/itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload('published')),
        })
        data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not publish')
        router.push(data.url)
      }
    } catch (err) {
      setPublishError(err.message)
      setPublishing(false)
    }
  }

  const days = Array.from({ length: dayCount }, (_, i) => i + 1)

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2rem 1.5rem 5rem', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 28 }}>

        {loadingExisting && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>Loading itinerary…</p>
        )}

        {/* Intent / search */}
        <section>
          <form onSubmit={runSearch} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
            <label style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--color-ink)', display: 'block', marginBottom: 10 }}>
              What kind of tour are you building?
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runSearch(e) }}
              placeholder="e.g. a winery tour in the Yarra Valley, with a long lunch and a maker or two"
              rows={2}
              style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--color-border)', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Region (optional, e.g. Yarra Valley)"
                style={{ flex: '1 1 220px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }}
              />
              <button type="submit" disabled={searching || !query.trim()} style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)',
                background: 'var(--color-gold)', border: 'none', padding: '11px 24px', borderRadius: 99,
                cursor: searching || !query.trim() ? 'default' : 'pointer', opacity: searching || !query.trim() ? 0.6 : 1,
              }}>
                {searching ? 'Searching…' : 'Find operators'}
              </button>
            </div>
            {detectedRegion && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: '10px 0 0' }}>
                Reading region as <strong style={{ color: 'var(--color-ink)' }}>{detectedRegion.name}</strong>, {detectedRegion.state}.
              </p>
            )}
            {searchError && <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#b3261e', margin: '10px 0 0' }}>{searchError}</p>}
          </form>
        </section>

        {/* Two columns: candidates + itinerary */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28, alignItems: 'start' }}>

          {/* Candidates */}
          <div>
            <h2 style={colHead}>Candidates {candidates.length > 0 && `· ${candidates.length}`}</h2>
            {!hasSearched && stops.length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6 }}>
                Describe a tour above, or start from a <Link href="/trade/directory" style={{ color: 'var(--color-gold)' }}>directory shortlist</Link>.
                Atlas searches the whole curated network — every candidate is a live, verified record, never an AI guess.
              </p>
            )}
            {hasSearched && !searching && candidates.length === 0 && !searchError && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)' }}>
                Nothing matched. Try fewer words, or a broader region.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {candidates.map((c) => {
                const added = stopIds.has(c.listing_id || c.id)
                return (
                  <div key={c.id} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>{c.name}</p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
                          {[c.vertical_label, c.sub_type, c.region || c.suburb, c.state].filter(Boolean).join(' · ')}
                          {c.trade_ready && <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>{'  ·  Trade-ready'}</span>}
                        </p>
                      </div>
                      <button onClick={() => (added ? removeStop(c.id) : addStop(c))} style={{
                        flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                        color: added ? 'var(--color-muted)' : 'var(--color-ink)',
                        background: added ? 'transparent' : 'var(--color-gold)',
                        border: added ? '1px solid var(--color-border)' : 'none',
                        padding: '7px 14px', borderRadius: 99, cursor: 'pointer',
                      }}>
                        {added ? 'Added' : '+ Add'}
                      </button>
                    </div>
                    {c.excerpt && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.55, margin: '8px 0 0' }}>{c.excerpt}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Itinerary / proposal */}
          <div style={{ position: 'sticky', top: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 10 }}>
              <h2 style={{ ...colHead, marginBottom: 0 }}>
                Proposal · {stops.length} {stops.length === 1 ? 'stop' : 'stops'}{dayCount > 1 ? ` · ${dayCount} days` : ''}
              </h2>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                {saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </div>

            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18 }}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Itinerary title"
                style={{ width: '100%', fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-ink)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', boxSizing: 'border-box', marginBottom: 10 }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Prepared for… (client, optional)"
                  style={{ flex: '1 1 160px', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', boxSizing: 'border-box' }}
                />
              </div>
              <textarea
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                placeholder="Cover note — the paragraph that sells the trip (optional)"
                rows={2}
                style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
              />

              {stops.length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
                  Add operators from the candidate list or a directory shortlist. Assign days, add time
                  hints and private notes; drive estimates appear between stops.
                </p>
              )}

              {days.map((day) => {
                const dayStops = stops.filter((s) => (s.day || 1) === day)
                return (
                  <div key={day}>
                    {dayCount > 1 && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '14px 0 8px' }}>
                        Day {day}
                      </p>
                    )}
                    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {dayStops.map((s, di) => {
                        const i = stops.findIndex((x) => x.listing_id === s.listing_id)
                        const next = dayStops[di + 1]
                        const leg = next ? legBetween(s, next) : null
                        return (
                          <li key={s.listing_id} style={{ borderTop: di === 0 && day === 1 ? 'none' : '1px solid var(--color-border)', paddingTop: di === 0 && day === 1 ? 0 : 12 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--color-gold)', minWidth: 22 }}>{String(i + 1).padStart(2, '0')}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>{s.name}</p>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '2px 0 0' }}>
                                  {[s.vertical_label, s.sub_type, s.region || s.suburb].filter(Boolean).join(' · ')}
                                </p>
                                {s.trade_ready && <TradeFields trade={s.trade} compact />}
                                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                  {dayCount > 1 && (
                                    <select
                                      aria-label="Day"
                                      value={s.day || 1}
                                      onChange={(e) => patchStop(s.listing_id, { day: Number(e.target.value) })}
                                      style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-ink)', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                                    >
                                      {days.map((d) => <option key={d} value={d}>Day {d}</option>)}
                                    </select>
                                  )}
                                  <input
                                    value={s.time_hint}
                                    onChange={(e) => patchStop(s.listing_id, { time_hint: e.target.value })}
                                    placeholder="Time (e.g. 10:00)"
                                    style={{ width: 110, fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-ink)', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)', boxSizing: 'border-box' }}
                                  />
                                </div>
                                <input
                                  value={s.notes}
                                  onChange={(e) => patchStop(s.listing_id, { notes: e.target.value })}
                                  placeholder="Add a note (optional)"
                                  style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', boxSizing: 'border-box', marginTop: 8 }}
                                />
                                {leg && (
                                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--color-muted)', margin: '8px 0 0' }}>
                                    ↓ {leg.label}
                                  </p>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <button aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={arrowBtn(i === 0)}>↑</button>
                                <button aria-label="Move down" onClick={() => move(i, 1)} disabled={i === stops.length - 1} style={arrowBtn(i === stops.length - 1)}>↓</button>
                                <button aria-label="Remove" onClick={() => removeStop(s.listing_id)} style={{ ...arrowBtn(false), color: '#b3261e' }}>✕</button>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )
              })}

              <button onClick={addDay} style={{
                marginTop: 14, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                color: 'var(--color-muted)', background: 'white', border: '1px dashed var(--color-border)',
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer', width: '100%',
              }}>
                + Add a day
              </button>

              {/* Baked-in attribution (preview of what ships on the artefact) */}
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-gold)', marginTop: 16, letterSpacing: '0.04em' }}>
                {ATLAS_ATTRIBUTION} — kept on every shared link and PDF{account?.org_name ? `, beside “Prepared by ${account.org_name}”` : ''}.
              </p>

              {publishError && <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#b3261e', margin: '10px 0 0' }}>{publishError}</p>}

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button onClick={() => saveDraft(false)} disabled={saving || (stops.length === 0 && !title.trim())} style={{
                  flex: 1, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  color: 'var(--color-ink)', background: 'white', border: '1px solid var(--color-border)', padding: '12px', borderRadius: 99,
                  cursor: 'pointer', opacity: saving ? 0.6 : 1,
                }}>
                  {itineraryId ? 'Save' : 'Save draft'}
                </button>
                <button onClick={publish} disabled={publishing || stops.length === 0} style={{
                  flex: 2, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                  color: 'var(--color-ink)', background: 'var(--color-gold)', border: 'none', padding: '12px', borderRadius: 99,
                  cursor: publishing || stops.length === 0 ? 'default' : 'pointer', opacity: publishing || stops.length === 0 ? 0.55 : 1,
                }}>
                  {publishing ? 'Publishing…' : status === 'published' ? 'Republish changes' : 'Publish & get shareable link'}
                </button>
              </div>
              {status === 'published' && slug && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '10px 0 0' }}>
                  Live at <Link href={`/trade/itinerary/${slug}`} style={{ color: 'var(--color-gold)' }}>/trade/itinerary/{slug}</Link>
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

const colHead = {
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 12,
}

function arrowBtn(disabled) {
  return {
    fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1,
    width: 24, height: 22, borderRadius: 6, border: '1px solid var(--color-border)',
    background: 'white', color: disabled ? 'var(--color-border)' : 'var(--color-muted)',
    cursor: disabled ? 'default' : 'pointer', padding: 0,
  }
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
