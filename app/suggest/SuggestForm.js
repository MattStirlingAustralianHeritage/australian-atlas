'use client'

import { useState } from 'react'

const VERTICALS = [
  { value: 'sba', label: 'Small Batch' },
  { value: 'craft', label: 'Craft' },
  { value: 'collection', label: 'Culture' },
  { value: 'fine_grounds', label: 'Fine Grounds' },
  { value: 'rest', label: 'Rest' },
  { value: 'field', label: 'Field' },
  { value: 'corner', label: 'Corner' },
  { value: 'found', label: 'Found' },
  { value: 'table', label: 'Table' },
]

const inputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: '8px',
  border: '1px solid var(--color-border)',
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  color: 'var(--color-ink)',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: '0.85rem',
  color: 'var(--color-muted)',
  marginBottom: '0.375rem',
}

export default function SuggestForm() {
  const [form, setForm] = useState({
    name: '',
    website_url: '',
    region: '',
    vertical: '',
    why_listed: '',
    submitter_name: '',
    submitter_email: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
      } else {
        setSubmitted(true)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const buttonStyle = {
    width: '100%',
    padding: '0.8rem 1rem',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-sage)',
    color: '#fff',
    fontFamily: 'var(--font-body)',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    transition: 'background 0.15s',
  }

  if (submitted) {
    return (
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        padding: '2rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        textAlign: 'center',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: '#f0fdf4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1rem',
          fontSize: '1.5rem',
        }}>
          <span style={{ color: '#166534' }}>&#10003;</span>
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          fontWeight: 400,
          color: 'var(--color-ink)',
          marginBottom: '0.75rem',
        }}>
          Thank you!
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.95rem',
          color: 'var(--color-muted)',
          lineHeight: 1.5,
        }}>
          We'll review your suggestion.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '2rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
            placeholder="Venue or place name"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Website</label>
          <input
            type="url"
            value={form.website_url}
            onChange={(e) => update('website_url', e.target.value)}
            placeholder="https://example.com.au"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Region / Location</label>
          <input
            type="text"
            value={form.region}
            onChange={(e) => update('region', e.target.value)}
            placeholder="e.g. Yarra Valley, VIC"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Category</label>
          <select
            value={form.vertical}
            onChange={(e) => update('vertical', e.target.value)}
            style={{
              ...inputStyle,
              appearance: 'auto',
            }}
          >
            <option value="">Select a category</option>
            {VERTICALS.map(v => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Why should it be listed?</label>
          <textarea
            value={form.why_listed}
            onChange={(e) => update('why_listed', e.target.value)}
            rows={3}
            placeholder="Tell us what makes this place special"
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: '80px',
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Your name</label>
          <input
            type="text"
            value={form.submitter_name}
            onChange={(e) => update('submitter_name', e.target.value)}
            placeholder="For credit (optional)"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Your email</label>
          <input
            type="email"
            value={form.submitter_email}
            onChange={(e) => update('submitter_email', e.target.value)}
            placeholder="For follow-up (optional)"
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{
            padding: '0.625rem 0.875rem',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Submitting...' : 'Submit suggestion'}
        </button>
      </form>
    </div>
  )
}
