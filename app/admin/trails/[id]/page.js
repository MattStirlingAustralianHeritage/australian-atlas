'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import TrailStopsMap from '@/components/TrailStopsMap'

const VERTICAL_BG = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const STATUS_COLORS = {
  pitch: { bg: '#E8E3DA', text: '#4A4338' },
  draft: { bg: '#F5EFE2', text: '#5A4A2C' },
  in_review: { bg: '#FCE4B8', text: '#7A5520' },
  published: { bg: '#C4D8B8', text: '#2C5020' },
  archived: { bg: '#E8E5E0', text: '#5A5550' },
}

const TRANSITION_BUTTONS = {
  draft: [{ action: 'submit_for_review', label: 'Submit for review' }, { action: 'unpublish', label: 'Archive' }],
  in_review: [{ action: 'approve_publish', label: 'Approve and publish' }, { action: 'return_to_draft', label: 'Return to draft' }],
  published: [{ action: 'unpublish', label: 'Unpublish (archive)' }],
  archived: [{ action: 'resurrect', label: 'Resurrect to draft' }],
}

export default function TrailDraftEditor() {
  const { id } = useParams()
  const router = useRouter()
  const [trail, setTrail] = useState(null)
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [transitionNotes, setTransitionNotes] = useState('')

  // Field-level dirty tracking for the trail metadata
  const [meta, setMeta] = useState({})

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/trails/${id}`)
    const d = await res.json()
    if (!res.ok) { setError(d?.error || `${res.status}`); setLoading(false); return }
    setTrail(d.trail)
    setStops(d.stops || [])
    setMeta({
      title: d.trail.title || '',
      slug: d.trail.slug || '',
      subtitle: d.trail.subtitle || '',
      intro: d.trail.intro || '',
      outro: d.trail.outro || '',
      hero_image_url: d.trail.hero_image_url || '',
      hero_image_alt: d.trail.hero_image_alt || '',
      hero_image_credit: d.trail.hero_image_credit || '',
      og_title: d.trail.og_title || '',
      og_description: d.trail.og_description || '',
      meta_description: d.trail.meta_description || '',
    })
    setLoading(false)
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: 60, textAlign: 'center', color: '#a73838' }}>{error}</div>
  if (!trail) return null

  const status = trail.status || 'draft'
  const transitions = TRANSITION_BUTTONS[status] || []

  function updateMeta(k, v) { setMeta(m => ({ ...m, [k]: v })) }

  async function save() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/trails/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(meta),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `${res.status}`)
      setTrail(d.trail)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function updateStop(stopId, patch) {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/trails/${id}/stops/${stopId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `${res.status}`)
      setStops(s => s.map(x => x.id === stopId ? { ...x, ...d.stop } : x))
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function deleteStop(stopId) {
    if (!confirm('Remove this stop?')) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/trails/${id}/stops/${stopId}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error) }
      await refresh()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function transition(action) {
    if (action === 'approve_publish' && !confirm('Approve and publish this trail?')) return
    if (action === 'unpublish' && !confirm('Archive this trail?')) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/trails/${id}/transitions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, notes: transitionNotes || null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `${res.status}`)
      setTransitionNotes('')
      await refresh()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto', paddingBottom: 120 }}>
      <header style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <Link href="/admin/trails" style={{ fontSize: 12, color: 'var(--color-muted)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>← All trails</Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: 'var(--color-ink)', margin: '4px 0' }}>
            {meta.title || <em style={{ color: 'var(--color-muted)' }}>Untitled draft</em>}
          </h1>
        </div>
        <StatusBadge status={status} />
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* LEFT — metadata + intro/outro */}
        <div>
          <ThesisCard thesis={trail.thesis} />

          <Field label="Title">
            <input value={meta.title} onChange={e => updateMeta('title', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Slug" hint="URL-friendly identifier — lowercase letters, numbers, hyphens.">
            <input value={meta.slug} onChange={e => updateMeta('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} style={inputStyle} />
          </Field>
          <Field label="Subtitle">
            <input value={meta.subtitle} onChange={e => updateMeta('subtitle', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Hero image URL" hint="Plain URL field for Phase 1. Phase 2 reuses the article media uploader.">
            <input value={meta.hero_image_url} onChange={e => updateMeta('hero_image_url', e.target.value)} placeholder="https://…" style={inputStyle} />
          </Field>
          {meta.hero_image_url && (
            <div style={{ marginTop: -8, marginBottom: 12 }}>
              <img src={meta.hero_image_url} alt="" style={{ maxWidth: '100%', height: 160, objectFit: 'cover', borderRadius: 4 }} />
            </div>
          )}
          <Field label="Hero alt text">
            <input value={meta.hero_image_alt} onChange={e => updateMeta('hero_image_alt', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Hero image credit">
            <input value={meta.hero_image_credit} onChange={e => updateMeta('hero_image_credit', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Intro" hint="Markdown. The opening editorial passage.">
            <textarea value={meta.intro} onChange={e => updateMeta('intro', e.target.value)} rows={10} style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.6 }} />
          </Field>
          <Field label="Outro" hint="Optional. Markdown.">
            <textarea value={meta.outro} onChange={e => updateMeta('outro', e.target.value)} rows={6} style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.6 }} />
          </Field>

          <details style={{ marginTop: 16, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 4 }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500 }}>SEO</summary>
            <div style={{ paddingTop: 12 }}>
              <Field label="Meta description">
                <textarea value={meta.meta_description} onChange={e => updateMeta('meta_description', e.target.value)} rows={2} style={inputStyle} />
              </Field>
              <Field label="OG title">
                <input value={meta.og_title} onChange={e => updateMeta('og_title', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="OG description">
                <textarea value={meta.og_description} onChange={e => updateMeta('og_description', e.target.value)} rows={2} style={inputStyle} />
              </Field>
            </div>
          </details>
        </div>

        {/* RIGHT — stops with editorial copy */}
        <div>
          <div style={{ position: 'sticky', top: 16, zIndex: 1, marginBottom: 12 }}>
            <TrailStopsMap stops={stops} height={260} />
          </div>
          <h2 style={panelHeading}>Stops ({stops.length})</h2>
          {stops.map((s, i) => (
            <StopCard key={s.id} stop={s} idx={i} totalCount={stops.length}
              onUpdate={patch => updateStop(s.id, patch)}
              onDelete={() => deleteStop(s.id)} />
          ))}
        </div>
      </div>

      {error && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', padding: '10px 16px', borderRadius: 4, background: '#a73838', color: '#fff', fontSize: 13, fontFamily: 'var(--font-body)', zIndex: 100 }}>
          {error}
        </div>
      )}

      <footer style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--color-cream)', borderTop: '1px solid var(--color-border)',
        padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, zIndex: 50,
      }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', display: 'flex', gap: 16 }}>
          <span>{stops.length} stops</span>
          <span>·</span>
          <span>{Math.round(trail.total_distance_km || 0)} km</span>
          <span>{Math.floor((trail.total_duration_minutes || 0) / 60)}h {Math.round((trail.total_duration_minutes || 0) % 60)}m</span>
          {(trail.vertical_mix || []).map(v => (
            <span key={v} style={{ background: VERTICAL_BG[v] + '20', color: VERTICAL_BG[v], padding: '1px 6px', borderRadius: 3, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9 }}>{v}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {transitions.length > 0 && (
            <input value={transitionNotes} onChange={e => setTransitionNotes(e.target.value)} placeholder="Transition notes (optional)…" style={{ ...inputStyle, padding: '8px 10px', fontSize: 12, width: 240 }} />
          )}
          {transitions.map(t => (
            <button key={t.action} onClick={() => transition(t.action)} disabled={saving} style={btnSecondary}>{t.label}</button>
          ))}
          <Link href={`/admin/trails/${id}/preview`} target="_blank" style={btnSecondary}>Preview</Link>
          <button onClick={save} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </footer>
    </div>
  )
}

function StopCard({ stop, idx, totalCount, onUpdate, onDelete }) {
  const [editorial, setEditorial] = useState(stop.editorial_copy || '')
  const [arrival, setArrival] = useState(stop.arrival_note || '')
  const [day, setDay] = useState(stop.day_number || 1)
  const [overnight, setOvernight] = useState(!!stop.is_overnight)
  const [pos, setPos] = useState(stop.position || idx + 1)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setEditorial(stop.editorial_copy || '')
    setArrival(stop.arrival_note || '')
    setDay(stop.day_number || 1)
    setOvernight(!!stop.is_overnight)
    setPos(stop.position || idx + 1)
    setDirty(false)
  }, [stop.id, stop.editorial_copy, stop.arrival_note, stop.day_number, stop.is_overnight, stop.position, idx])

  function flush() {
    if (!dirty) return
    onUpdate({ editorial_copy: editorial, arrival_note: arrival, day_number: day, is_overnight: overnight })
    setDirty(false)
  }

  const listing = stop.listings || {}

  return (
    <div style={{ border: '1px solid var(--color-border)', background: '#fff', borderRadius: 6, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', marginRight: 8 }}>#{idx + 1}</span>
          {listing.slug ? (
            <a href={`/${listing.vertical}/${listing.slug}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-ink)', textDecoration: 'none' }}>
              {stop.venue_name}
            </a>
          ) : (
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-ink)' }}>{stop.venue_name}</span>
          )}
          {stop.vertical && (
            <span style={{ background: VERTICAL_BG[stop.vertical] + '20', color: VERTICAL_BG[stop.vertical], padding: '1px 7px', borderRadius: 3, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9, fontFamily: 'var(--font-body)', marginLeft: 8 }}>
              {stop.vertical}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
            Day{' '}
            <select value={day} onChange={e => { setDay(Number(e.target.value)); setDirty(true) }} onBlur={flush} style={{ padding: '2px 6px', fontSize: 12 }}>
              {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
            Pos{' '}
            <input type="number" min={1} max={totalCount} value={pos} onChange={e => { setPos(Number(e.target.value)); setDirty(true) }} onBlur={() => { if (pos !== stop.position) onUpdate({ position: pos }); setDirty(false) }} style={{ width: 50, padding: '2px 6px', fontSize: 12 }} />
          </label>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
            <input type="checkbox" checked={overnight} onChange={e => { setOvernight(e.target.checked); setDirty(true) }} onBlur={flush} /> overnight
          </label>
          <button onClick={onDelete} style={{ width: 26, height: 26, padding: 0, border: '1px solid var(--color-border)', background: '#fff', borderRadius: 3, fontFamily: 'var(--font-body)', fontSize: 14, cursor: 'pointer', color: '#a73838' }}>×</button>
        </div>
      </div>
      {(stop.distance_from_previous_km != null || stop.duration_from_previous_minutes != null) && (
        <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>
          {Math.round(stop.distance_from_previous_km || 0)} km · {Math.round(stop.duration_from_previous_minutes || 0)} min from previous
        </div>
      )}
      <textarea
        value={editorial} onChange={e => { setEditorial(e.target.value); setDirty(true) }} onBlur={flush}
        rows={4}
        placeholder="Editorial copy for this stop. Markdown."
        style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.55 }}
      />
      <input value={arrival} onChange={e => { setArrival(e.target.value); setDirty(true) }} onBlur={flush} placeholder="Arrival note — e.g. 'Allow 30–45 min', 'Booking essential'…" style={{ ...inputStyle, marginTop: 8, fontSize: 12 }} />
    </div>
  )
}

function ThesisCard({ thesis }) {
  if (!thesis) return null
  return (
    <div style={{ background: 'var(--color-cream)', padding: '10px 14px', borderRadius: 4, marginBottom: 12, borderLeft: '3px solid var(--color-sage, #7A8B6F)' }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
        Thesis (internal-only — what you're writing toward)
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.4 }}>"{thesis}"</div>
    </div>
  )
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#eee', text: '#666' }
  return (
    <span style={{
      background: c.bg, color: c.text, padding: '4px 10px', borderRadius: 100,
      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{status}</span>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 3, fontFamily: 'var(--font-body)' }}>{hint}</div>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)',
  borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 13,
  background: '#fff', color: 'var(--color-ink)', boxSizing: 'border-box',
}

const panelHeading = { fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }
const btnPrimary = { padding: '8px 18px', borderRadius: 4, border: 'none', background: 'var(--color-ink)', color: 'var(--color-cream)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }
const btnSecondary = { padding: '8px 14px', borderRadius: 4, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer', textDecoration: 'none' }
