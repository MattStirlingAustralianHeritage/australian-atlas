'use client'

import { useState } from 'react'

// Mirror of VERTICAL_NAMES in CandidateReviewQueue — kept local so this
// form stays self-contained and doesn't reach into the queue's internals.
const VERTICAL_OPTIONS = [
  { value: 'sba', label: 'Small Batch' },
  { value: 'collection', label: 'Culture' },
  { value: 'craft', label: 'Craft' },
  { value: 'fine_grounds', label: 'Fine Grounds' },
  { value: 'rest', label: 'Rest' },
  { value: 'field', label: 'Field' },
  { value: 'corner', label: 'Corner' },
  { value: 'found', label: 'Found' },
  { value: 'table', label: 'Table' },
  { value: 'way', label: 'Way' },
]

const STATE_OPTIONS = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

const EMPTY = { name: '', vertical: '', vertical_secondary: '', website_url: '', address: '', state: '', region: '', notes: '' }

const labelStyle = {
  display: 'block', fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)',
  marginBottom: 4,
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
  background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8,
  padding: '8px 10px',
}

export default function AddListingForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY)

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const close = () => {
    setForm(EMPTY)
    setError(null)
    setOpen(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.vertical) { setError('Choose a vertical'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/candidates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Create failed')
        setSubmitting(false)
        return
      }

      let candidate = data.candidate

      // Geocode straight away by reusing the card's blur endpoint, so the
      // new candidate lands publish-ready with lat/lng (and a derived state)
      // already persisted. Non-fatal — the publish handler geocodes again
      // as a fallback if this fails.
      if (candidate?.id && form.address.trim()) {
        try {
          const geoRes = await fetch(`/api/admin/candidates/${candidate.id}/geocode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: form.address, state: form.state }),
          })
          if (geoRes.ok) {
            const geo = await geoRes.json()
            if (!geo.geocode_failed) {
              candidate = {
                ...candidate,
                lat: geo.lat,
                lng: geo.lng,
                state: candidate.state || form.state || null,
              }
            }
          }
        } catch { /* ignore — publish geocodes as fallback */ }
      }

      onCreated?.(candidate)
      close()
    } catch (err) {
      setError(err.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.04em',
            color: 'var(--color-sage)', background: 'transparent',
            border: '1px solid var(--color-sage)', borderRadius: 8,
            padding: '9px 18px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.15s',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add a listing
        </button>
      </div>
    )
  }

  return (
    <div style={{
      marginBottom: 20, padding: '18px 20px',
      background: 'var(--color-cream)', borderRadius: 12,
      border: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{
          fontFamily: 'var(--font-display, Georgia)', fontSize: 16, fontWeight: 400,
          color: 'var(--color-ink)',
        }}>
          Add a listing manually
        </span>
        <button
          onClick={close}
          aria-label="Close"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)',
          }}
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Name *</label>
            <input
              autoFocus
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Ripple Brewing"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Vertical *</label>
            <select value={form.vertical} onChange={set('vertical')} style={inputStyle}>
              <option value="">Select…</option>
              {VERTICAL_OPTIONS.map(v => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Also in <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
            <select value={form.vertical_secondary} onChange={set('vertical_secondary')} style={inputStyle} disabled={!form.vertical}>
              <option value="">—</option>
              {VERTICAL_OPTIONS.filter(v => v.value !== form.vertical).map(v => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>State</label>
            <select value={form.state} onChange={set('state')} style={inputStyle}>
              <option value="">—</option>
              {STATE_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Website</label>
            <input
              value={form.website_url}
              onChange={set('website_url')}
              placeholder="ripplebrewing.com.au"
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Address</label>
            <input
              value={form.address}
              onChange={set('address')}
              placeholder="Street address — geocoded on save"
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Region <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
            <input
              value={form.region}
              onChange={set('region')}
              placeholder="e.g. Mornington Peninsula"
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Notes <span style={{ textTransform: 'none', fontWeight: 400 }}>(internal)</span></label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              placeholder="Why this is worth listing, where you found it…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              letterSpacing: '0.04em',
              color: '#fff', background: submitting ? '#8a9a86' : 'var(--color-sage)',
              border: 'none', borderRadius: 8, padding: '9px 20px',
              cursor: submitting ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {submitting ? (
              <>
                <div style={{
                  width: 13, height: 13,
                  border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff',
                  borderRadius: '50%', animation: 'candidateSpinner 0.6s linear infinite',
                }} />
                Adding…
              </>
            ) : 'Add to queue'}
          </button>

          {error && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: '#CC4444',
            }}>
              {error}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
