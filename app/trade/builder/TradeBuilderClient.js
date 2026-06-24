'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TradeFields from '@/components/trade/TradeFields'
import { ATLAS_ATTRIBUTION } from '@/lib/trade/config'

export default function TradeBuilderClient({ account }) {
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [detectedRegion, setDetectedRegion] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  const [stops, setStops] = useState([]) // ordered
  const [title, setTitle] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState(null)

  const stopIds = new Set(stops.map((s) => s.listing_id))

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
    if (stopIds.has(c.listing_id)) return
    setStops((prev) => [...prev, { ...c, listing_id: c.id, notes: '' }])
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
  function setNote(id, value) {
    setStops((prev) => prev.map((s) => (s.listing_id === id ? { ...s, notes: value } : s)))
  }

  async function publish() {
    setPublishError(null)
    if (stops.length === 0) { setPublishError('Add at least one stop first.'); return }
    if (!title.trim()) { setPublishError('Give the itinerary a title.'); return }
    setPublishing(true)
    try {
      const res = await fetch('/api/trade/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          intent_text: query.trim() || null,
          region: detectedRegion?.name || region.trim() || null,
          status: 'published',
          stops: stops.map((s) => ({ listing_id: s.listing_id, notes: s.notes || null })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not publish')
      router.push(data.url)
    } catch (err) {
      setPublishError(err.message)
      setPublishing(false)
    }
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--color-border)', background: 'white' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '18px 1.5rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: 0 }}>
              Atlas Trade · Builder
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: 'var(--color-ink)', margin: '2px 0 0' }}>
              Build an itinerary
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
              {account?.org_name}
            </span>
            <Link href="/trade/itineraries" style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-gold)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              My itineraries
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2rem 1.5rem 5rem', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 28 }}>

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
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 12 }}>
              Candidates {candidates.length > 0 && `· ${candidates.length}`}
            </h2>
            {!hasSearched && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6 }}>
                Describe a tour above. Atlas searches the whole curated network — the candidate set is drawn from every operator, not only those flagged for the trade.
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

          {/* Itinerary */}
          <div style={{ position: 'sticky', top: 16 }}>
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 12 }}>
              Itinerary · {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
            </h2>
            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18 }}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Itinerary title"
                style={{ width: '100%', fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-ink)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', boxSizing: 'border-box', marginBottom: 14 }}
              />

              {stops.length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
                  Add operators from the candidate list. Reorder with the arrows; add a private note to any stop.
                </p>
              )}

              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stops.map((s, i) => (
                  <li key={s.listing_id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border)', paddingTop: i === 0 ? 0 : 12 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--color-gold)', minWidth: 22 }}>{String(i + 1).padStart(2, '0')}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>{s.name}</p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '2px 0 0' }}>
                          {[s.vertical_label, s.sub_type, s.region || s.suburb].filter(Boolean).join(' · ')}
                        </p>
                        {s.trade_ready && <TradeFields trade={s.trade} compact />}
                        <input
                          value={s.notes}
                          onChange={(e) => setNote(s.listing_id, e.target.value)}
                          placeholder="Add a note (optional)"
                          style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', boxSizing: 'border-box', marginTop: 8 }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={arrowBtn(i === 0)}>↑</button>
                        <button aria-label="Move down" onClick={() => move(i, 1)} disabled={i === stops.length - 1} style={arrowBtn(i === stops.length - 1)}>↓</button>
                        <button aria-label="Remove" onClick={() => removeStop(s.listing_id)} style={{ ...arrowBtn(false), color: '#b3261e' }}>✕</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Baked-in attribution (preview of what ships on the artefact) */}
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-gold)', marginTop: 16, letterSpacing: '0.04em' }}>
                {ATLAS_ATTRIBUTION} — kept on every shared link and PDF.
              </p>

              {publishError && <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#b3261e', margin: '10px 0 0' }}>{publishError}</p>}

              <button onClick={publish} disabled={publishing || stops.length === 0} style={{
                width: '100%', marginTop: 14, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                color: 'var(--color-ink)', background: 'var(--color-gold)', border: 'none', padding: '12px', borderRadius: 99,
                cursor: publishing || stops.length === 0 ? 'default' : 'pointer', opacity: publishing || stops.length === 0 ? 0.55 : 1,
              }}>
                {publishing ? 'Publishing…' : 'Publish & get shareable link'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
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
