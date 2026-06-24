'use client'

import { useState } from 'react'

// Friendly names for the 10 network verticals (mirrors the Producer Picks map).
// The value is the vertical slug the candidate pipeline expects.
const VERTICAL_OPTIONS = [
  { value: 'fine_grounds', label: 'Coffee roaster or café — Fine Grounds' },
  { value: 'sba', label: 'Brewery, winery, distillery or cidery — Small Batch' },
  { value: 'table', label: 'Restaurant, bakery or food producer — Table' },
  { value: 'rest', label: 'Place to stay — Rest' },
  { value: 'craft', label: 'Maker or craft studio — Craft' },
  { value: 'collection', label: 'Museum, gallery or cultural site — Culture' },
  { value: 'corner', label: 'Independent shop — Corner' },
  { value: 'found', label: 'Vintage, antiques or op shop — Found' },
  { value: 'field', label: 'Natural place or walk — Field' },
  { value: 'way', label: 'Tour, guide or experience — Way' },
]

const INPUT_STYLE = {
  fontFamily: 'var(--font-sans)',
  fontSize: '0.9rem',
  padding: '0.6rem 0.75rem',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  background: '#fff',
  color: 'var(--color-ink)',
}

const LABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.72rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-muted)',
  marginBottom: '0.4rem',
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
      {hint && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.35rem 0 0' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

export default function DashboardRecommend() {
  const [name, setName] = useState('')
  const [vertical, setVertical] = useState('')
  const [website, setWebsite] = useState('')
  const [region, setRegion] = useState('')
  const [note, setNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { status, message }

  const canSubmit = name.trim() && vertical && !submitting

  function reset() {
    setName(''); setVertical(''); setWebsite(''); setRegion(''); setNote('')
    setError(null); setResult(null)
  }

  async function submit(e) {
    e?.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/dashboard/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, vertical, website_url: website, region, note }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
      } else {
        setResult(data)
      }
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
          Recommend a Listing
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0 }}>
          Know a great independent business or place that should be on the Atlas? Tell us about it and our team will take a look.
        </p>
      </div>

      {result ? (
        <div style={{
          background: result.status === 'queued' ? '#f0f7f2' : '#fbf8f0',
          border: `1px solid ${result.status === 'queued' ? '#bcdcc7' : '#e6dcc0'}`,
          borderRadius: 12,
          padding: '1.75rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>
            {result.status === 'queued' ? '🌱' : result.status === 'exists' ? '✓' : '👀'}
          </div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
            {result.message}
          </p>
          {result.status === 'exists' && result.listing?.slug && (
            <p style={{ margin: '0 0 1rem' }}>
              <a href={`/place/${result.listing.slug}`} style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-sage, #4A7C59)' }}>
                View their listing →
              </a>
            </p>
          )}
          <button
            onClick={reset}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600,
              padding: '0.55rem 1.25rem', borderRadius: 8, border: '1px solid var(--color-border)',
              background: '#fff', color: 'var(--color-ink)', cursor: 'pointer', marginTop: '0.5rem',
            }}
          >
            Recommend another
          </button>
        </div>
      ) : (
        <form onSubmit={submit} style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          padding: '1.75rem',
        }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#c62828', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <Field label="Business or place name">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Wildflower Bakery"
              maxLength={160}
              style={INPUT_STYLE}
            />
          </Field>

          <Field label="What kind of place is it?">
            <select value={vertical} onChange={e => setVertical(e.target.value)} style={{ ...INPUT_STYLE, appearance: 'auto' }}>
              <option value="">Choose one…</option>
              {VERTICAL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Website" hint="Optional, but it helps us find and verify them faster.">
            <input
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="wildflowerbakery.com.au"
              style={INPUT_STYLE}
            />
          </Field>

          <Field label="Town or region" hint="Optional — where are they based?">
            <input
              value={region}
              onChange={e => setRegion(e.target.value)}
              placeholder="e.g. Castlemaine, VIC"
              style={INPUT_STYLE}
            />
          </Field>

          <Field label="Why recommend them?" hint="Optional — a sentence on what makes them worth a spot.">
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="e.g. Tiny sourdough bakery, everything's made on site — a real local institution."
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />
          </Field>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600,
                padding: '0.6rem 1.4rem', borderRadius: 8, border: 'none',
                background: !canSubmit ? '#cbd5cb' : 'var(--color-sage, #4A7C59)',
                color: '#fff', cursor: !canSubmit ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Sending…' : 'Send recommendation'}
            </button>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)' }}>
              Goes straight to our review team.
            </span>
          </div>
        </form>
      )}
    </div>
  )
}
