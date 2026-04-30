'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const VERTICALS = [
  { id: 'sba', label: 'Small Batch' },
  { id: 'collection', label: 'Culture' },
  { id: 'craft', label: 'Craft' },
  { id: 'fine_grounds', label: 'Fine Grounds' },
  { id: 'rest', label: 'Rest' },
  { id: 'field', label: 'Field' },
  { id: 'corner', label: 'Corner' },
  { id: 'found', label: 'Found' },
  { id: 'table', label: 'Table' },
]

const SEASON_OPTIONS = ['year-round', 'summer', 'autumn', 'winter', 'spring']
const DEFAULT_MOOD_TAGS = ['slow', 'considered', 'family-friendly', 'adventurous', 'gourmet', 'heritage', 'remote']

export default function NewPitchPage() {
  const router = useRouter()
  const [regions, setRegions] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [thesis, setThesis] = useState('')
  const [moodBrief, setMoodBrief] = useState('')
  const [regionId, setRegionId] = useState('')
  const [secondaryRegionIds, setSecondaryRegionIds] = useState([])
  const [dayCount, setDayCount] = useState(1)
  const [verticalWeights, setVerticalWeights] = useState(() => Object.fromEntries(VERTICALS.map(v => [v.id, 1])))
  const [showConstraints, setShowConstraints] = useState(false)
  const [maxKmPerDay, setMaxKmPerDay] = useState(200)
  const [seasonWindow, setSeasonWindow] = useState('year-round')
  const [moodTags, setMoodTags] = useState([])
  const [moodTagInput, setMoodTagInput] = useState('')

  useEffect(() => {
    fetch('/api/admin/regions').then(r => r.ok ? r.json() : { regions: [] }).then(d => setRegions(d.regions || [])).catch(() => {})
  }, [])

  function toggleVertical(id) {
    setVerticalWeights(prev => ({ ...prev, [id]: prev[id] > 0 ? 0 : 1 }))
  }
  function setWeight(id, w) {
    setVerticalWeights(prev => ({ ...prev, [id]: Number(w) }))
  }
  function addMoodTag() {
    const v = moodTagInput.trim()
    if (v && !moodTags.includes(v)) setMoodTags([...moodTags, v])
    setMoodTagInput('')
  }
  function toggleSecondaryRegion(id) {
    setSecondaryRegionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function generate() {
    setError(null)
    if (!thesis.trim()) { setError('Thesis is required.'); return }
    if (!regionId) { setError('Primary region is required.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/trails/pitches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          thesis: thesis.trim(),
          mood_brief: moodBrief.trim() || null,
          region_id: regionId,
          secondary_region_ids: secondaryRegionIds,
          day_count: Number(dayCount),
          vertical_weights: verticalWeights,
          max_km_per_day: Number(maxKmPerDay),
          season_window: seasonWindow,
          mood_tags: moodTags,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `${res.status}`)
      router.push(`/admin/trails/pitch/${data.pitch.id}`)
    } catch (e) {
      setError(e.message)
      setSubmitting(false)
    }
  }

  const filteredSecondary = regions.filter(r => r.id !== regionId)

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 4 }}>
          New trail pitch
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>
          Sketch the editorial argument and constraints. The pitch tool returns structural candidates only — no draft prose. The writing comes later.
        </p>
      </header>

      {/* Thesis — most important */}
      <Field label="Thesis" required hint="What is this trail's editorial argument? One sentence. Max 200 chars.">
        <textarea
          value={thesis} onChange={e => setThesis(e.target.value.slice(0, 200))}
          placeholder="e.g. South Australia's artisan corridor follows a single road from the Barossa to the Adelaide Hills."
          rows={3}
          style={{ ...inputStyle, fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.45, padding: 14 }}
        />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{thesis.length}/200</div>
      </Field>

      <Field label="Primary region" required>
        <select value={regionId} onChange={e => setRegionId(e.target.value)} style={inputStyle}>
          <option value="">Select…</option>
          {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>

      <Field label="Secondary regions" hint="Optional — for trails that span multiple regions.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {filteredSecondary.length === 0 && <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>(pick a primary region first)</span>}
          {filteredSecondary.map(r => (
            <button type="button" key={r.id} onClick={() => toggleSecondaryRegion(r.id)} style={chipStyle(secondaryRegionIds.includes(r.id))}>
              {r.name}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Day count">
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 7].map(n => (
            <button type="button" key={n} onClick={() => setDayCount(n)} style={segStyle(dayCount === n)}>{n}</button>
          ))}
        </div>
      </Field>

      <Field label="Vertical mix" hint="All selected by default with weight 1.0. Untoggle to exclude; adjust weight 0–1 to bias the candidate pool.">
        <div style={{ display: 'grid', gap: 6 }}>
          {VERTICALS.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140, fontSize: 13, fontFamily: 'var(--font-body)' }}>
                <input type="checkbox" checked={(verticalWeights[v.id] ?? 0) > 0} onChange={() => toggleVertical(v.id)} />
                {v.label}
              </label>
              <input
                type="range" min={0} max={1} step={0.1}
                value={verticalWeights[v.id] ?? 0}
                onChange={e => setWeight(v.id, e.target.value)}
                disabled={(verticalWeights[v.id] ?? 0) === 0}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, color: 'var(--color-muted)', minWidth: 32, textAlign: 'right', fontFamily: 'var(--font-body)' }}>
                {(verticalWeights[v.id] ?? 0).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </Field>

      <details open={showConstraints} onToggle={e => setShowConstraints(e.target.open)} style={{ marginBottom: 16, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 4 }}>
        <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-ink)' }}>
          Constraints
        </summary>
        <div style={{ paddingTop: 12 }}>
          <Field label="Max km per day">
            <input type="number" value={maxKmPerDay} onChange={e => setMaxKmPerDay(e.target.value)} min={50} max={1000} style={inputStyle} />
          </Field>

          <Field label="Season window">
            <select value={seasonWindow} onChange={e => setSeasonWindow(e.target.value)} style={inputStyle}>
              {SEASON_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="Mood tags" hint="Used to bias the candidate selection. Type and Enter to add.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {DEFAULT_MOOD_TAGS.map(t => (
                <button type="button" key={t} onClick={() => moodTags.includes(t) ? setMoodTags(moodTags.filter(x => x !== t)) : setMoodTags([...moodTags, t])} style={chipStyle(moodTags.includes(t))}>
                  {t}
                </button>
              ))}
              {moodTags.filter(t => !DEFAULT_MOOD_TAGS.includes(t)).map(t => (
                <button type="button" key={t} onClick={() => setMoodTags(moodTags.filter(x => x !== t))} style={chipStyle(true)}>{t} ×</button>
              ))}
            </div>
            <input value={moodTagInput} onChange={e => setMoodTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMoodTag() } }} placeholder="custom tag…" style={inputStyle} />
          </Field>
        </div>
      </details>

      <Field label="Mood brief" hint="Optional. 500 chars. Shapes the candidate selection without telling the model what to write.">
        <textarea value={moodBrief} onChange={e => setMoodBrief(e.target.value.slice(0, 500))} rows={3} style={inputStyle} />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{moodBrief.length}/500</div>
      </Field>

      {error && (
        <div style={{ padding: 12, borderRadius: 4, background: 'rgba(220,38,38,0.08)', color: '#a73838', fontSize: 13, fontFamily: 'var(--font-body)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <button onClick={generate} disabled={submitting} style={{
        width: '100%', padding: '14px 24px', borderRadius: 4,
        background: submitting ? 'var(--color-muted)' : 'var(--color-ink)', color: 'var(--color-cream)',
        border: 'none', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
        cursor: submitting ? 'wait' : 'pointer',
      }}>
        {submitting ? 'Generating candidates…' : 'Generate candidates'}
      </button>
    </div>
  )
}

function Field({ label, hint, required, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#c4634f' }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4, fontFamily: 'var(--font-body)' }}>{hint}</div>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)',
  borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 13,
  background: '#fff', color: 'var(--color-ink)', boxSizing: 'border-box',
}

function segStyle(active) {
  return {
    flex: 1, padding: '8px 12px', border: `1px solid ${active ? 'var(--color-ink)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-ink)' : '#fff', color: active ? 'var(--color-cream)' : 'var(--color-ink)',
    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 4,
  }
}
function chipStyle(active) {
  return {
    padding: '4px 10px', border: `1px solid ${active ? 'var(--color-ink)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-ink)' : '#fff', color: active ? 'var(--color-cream)' : 'var(--color-ink)',
    fontFamily: 'var(--font-body)', fontSize: 11, cursor: 'pointer', borderRadius: 100,
  }
}
