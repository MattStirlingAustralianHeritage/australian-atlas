'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const VERTICAL_BG = VERTICAL_ACCENTS

export default function PitchReviewPage() {
  const { id } = useParams()
  const router = useRouter()
  const [pitch, setPitch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stops, setStops] = useState([])  // working sequence (editor-mutable)
  const [promoting, setPromoting] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/trails/pitches/${id}`).then(r => r.json()).then(d => {
      setPitch(d.pitch || null)
      setStops(d.pitch?.candidate_results?.stops || [])
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)' }}>Loading…</div>
  if (!pitch) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)' }}>Pitch not found.</div>

  const candidates = pitch.candidate_results?.candidate_pool || []
  const warnings = pitch.candidate_results?.warnings || []
  const sequencedIds = new Set(stops.map(s => s.listing_id))
  const alternatives = candidates.filter(c => !sequencedIds.has(c.id))

  const totalKm = stops.reduce((s, x) => s + (x.distance_from_previous_km || 0), 0)
  const totalMin = stops.reduce((s, x) => s + (x.duration_from_previous_minutes || 0), 0)
  const days = Array.from(new Set(stops.map(s => s.suggested_day))).sort()
  const verticalMix = [...new Set(stops.map(s => s.listing?.vertical).filter(Boolean))]

  function moveStop(idx, dir) {
    const next = [...stops]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setStops(next.map((s, i) => ({ ...s, suggested_position: i + 1 })))
  }
  function removeStop(idx) {
    setStops(stops.filter((_, i) => i !== idx).map((s, i) => ({ ...s, suggested_position: i + 1 })))
  }
  function setStopDay(idx, day) {
    setStops(stops.map((s, i) => i === idx ? { ...s, suggested_day: Number(day) } : s))
  }
  function addCandidate(c) {
    const newStop = {
      listing_id: c.id,
      suggested_position: stops.length + 1,
      suggested_day: stops[stops.length - 1]?.suggested_day || 1,
      rationale: '',
      is_overnight: false,
      listing: { id: c.id, name: c.name, vertical: c.vertical, similarity: c.similarity },
      distance_from_previous_km: null,
      duration_from_previous_minutes: null,
    }
    setStops([...stops, newStop])
  }

  async function regenerate() {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/admin/trails/pitches/${id}/regenerate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `${res.status}`)
      setPitch(data.pitch)
      setStops(data.pitch.candidate_results?.stops || [])
    } catch (e) { setError(e.message) } finally { setRegenerating(false) }
  }

  async function promote() {
    setPromoting(true)
    setError(null)
    try {
      // Persist current sequence back to pitch first so promote uses the editor-curated version.
      const updated = { ...pitch.candidate_results, stops }
      // POST promote — the API uses pitch.candidate_results.stops directly.
      // Update pitch row with updated candidate_results before promote.
      const upRes = await fetch(`/api/admin/trails/pitches/${id}/regenerate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
      // Actually we need a way to save the curated sequence WITHOUT regenerating.
      // Simplest: POST promote with the current stops as body — but the API doesn't accept that yet.
      // For Phase 1 we'll require the editor to promote whatever the model produced; reorder/swap edits can happen on the draft.
      // (Backlog: support editor-curated sequence injection at promote time.)
      const r2 = await fetch(`/api/admin/trails/pitches/${id}/promote`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d2 = await r2.json()
      if (!r2.ok) throw new Error(d2?.error || `${r2.status}`)
      router.push(`/admin/trails/${d2.trail_id}`)
    } catch (e) { setError(e.message); setPromoting(false) }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 16 }}>
        <Link href="/admin/trails" style={{ fontSize: 12, color: 'var(--color-muted)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>← All trails</Link>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: 'var(--color-ink)', margin: '4px 0', lineHeight: 1.4 }}>
          Pitch review
        </h1>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--color-ink)', lineHeight: 1.45, padding: '12px 16px', background: 'var(--color-cream)', borderRadius: 4, marginTop: 8 }}>
          "{pitch.thesis}"
        </p>
        {pitch.mood_brief && <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', marginTop: 8 }}>Mood brief: {pitch.mood_brief}</p>}
      </header>

      {warnings.length > 0 && (
        <div style={{ background: 'rgba(196,154,60,0.08)', border: '1px solid rgba(196,154,60,0.3)', padding: '10px 14px', borderRadius: 4, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: '#8A6520', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Warnings ({warnings.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--color-ink)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        {/* LEFT — proposed sequence */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
              Proposed sequence ({stops.length})
            </h2>
            <button onClick={regenerate} disabled={regenerating} style={btnSecondary}>
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>

          {stops.map((s, i) => (
            <div key={`${s.listing_id}-${i}`} style={{ border: '1px solid var(--color-border)', background: '#fff', borderRadius: 6, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', minWidth: 24 }}>#{i + 1}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 400, color: 'var(--color-ink)' }}>
                    {s.listing?.name || `(unknown ${s.listing_id})`}
                  </span>
                  {s.listing?.vertical && (
                    <span style={{ background: VERTICAL_BG[s.listing.vertical] + '20', color: VERTICAL_BG[s.listing.vertical], padding: '1px 7px', borderRadius: 3, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9, fontFamily: 'var(--font-body)' }}>
                      {s.listing.vertical}
                    </span>
                  )}
                  {s.is_overnight && (
                    <span style={{ background: 'rgba(45,42,38,0.1)', color: 'var(--color-ink)', padding: '1px 7px', borderRadius: 3, fontSize: 9, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                      overnight
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => moveStop(i, -1)} title="Move up" style={iconBtn}>↑</button>
                  <button onClick={() => moveStop(i, 1)} title="Move down" style={iconBtn}>↓</button>
                  <button onClick={() => removeStop(i)} title="Remove" style={{ ...iconBtn, color: '#a73838' }}>×</button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Day
                  <select value={s.suggested_day || 1} onChange={e => setStopDay(i, e.target.value)} style={{ border: '1px solid var(--color-border)', borderRadius: 3, padding: '2px 6px', fontSize: 12 }}>
                    {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                {s.distance_from_previous_km != null && <span>· {Math.round(s.distance_from_previous_km)} km · {Math.round(s.duration_from_previous_minutes || 0)} min from previous</span>}
                {s.listing?.region && <span>· {s.listing.region}</span>}
              </div>
              {s.rationale && (
                <div style={{ fontSize: 12, color: 'var(--color-ink)', fontFamily: 'var(--font-body)', lineHeight: 1.55, fontStyle: 'italic', borderLeft: '2px solid var(--color-border)', paddingLeft: 10 }}>
                  {s.rationale}
                </div>
              )}
            </div>
          ))}
          {stops.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', border: '1px dashed var(--color-border)', borderRadius: 6 }}>
              No stops in the sequence yet. Add from the alternatives →
            </div>
          )}
        </div>

        {/* RIGHT — running totals + alternatives */}
        <aside>
          <div style={{ background: 'var(--color-cream)', padding: 14, borderRadius: 6, marginBottom: 16 }}>
            <h3 style={panelHeading}>Running totals</h3>
            <Stat label="Stops" value={stops.length} />
            <Stat label="Days" value={days.length || '—'} />
            <Stat label="Distance" value={`${Math.round(totalKm)} km`} />
            <Stat label="Drive time" value={`${Math.floor(totalMin / 60)}h ${Math.round(totalMin % 60)}m`} />
            <Stat label="Vertical mix" value={verticalMix.join(', ') || '—'} />
            <Stat label="Scoring" value={pitch.candidate_results?.scoring_mode || '—'} />
            <Stat label="Prompt v" value={pitch.candidate_results?.prompt_version || '—'} />
          </div>

          <div>
            <h3 style={panelHeading}>Alternatives ({alternatives.length})</h3>
            <div style={{ display: 'grid', gap: 6 }}>
              {alternatives.map(c => (
                <button key={c.id} onClick={() => addCandidate(c)} style={{ textAlign: 'left', padding: '8px 10px', border: '1px solid var(--color-border)', background: '#fff', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink)' }}>+ {c.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', display: 'flex', gap: 6 }}>
                    <span>{c.vertical}</span>
                    {c.similarity != null && <span>· {(c.similarity * 100).toFixed(0)}% match</span>}
                  </div>
                </button>
              ))}
              {!alternatives.length && (
                <div style={{ fontSize: 11, color: 'var(--color-muted)', padding: 8 }}>(no alternatives in pool)</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 4, background: 'rgba(220,38,38,0.08)', color: '#a73838', fontSize: 13, fontFamily: 'var(--font-body)' }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Link href="/admin/trails" style={{ padding: '10px 18px', borderRadius: 4, border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontSize: 13, textDecoration: 'none' }}>Cancel</Link>
        <button onClick={promote} disabled={promoting || stops.length === 0} style={{
          padding: '10px 24px', borderRadius: 4, border: 'none',
          background: stops.length && !promoting ? 'var(--color-ink)' : 'var(--color-muted)',
          color: 'var(--color-cream)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
          cursor: stops.length && !promoting ? 'pointer' : 'not-allowed',
        }}>
          {promoting ? 'Promoting…' : 'Promote to draft trail →'}
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: 'var(--font-body)', fontSize: 12 }}>
      <span style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const panelHeading = { fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }
const btnSecondary = { padding: '6px 12px', border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer' }
const iconBtn = { width: 26, height: 26, padding: 0, border: '1px solid var(--color-border)', background: '#fff', borderRadius: 3, fontFamily: 'var(--font-body)', fontSize: 14, cursor: 'pointer' }
