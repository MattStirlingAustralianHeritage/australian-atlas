'use client'

import { useCouncil } from '../layout'
import { useState } from 'react'

const CATEGORIES = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'feature', label: 'Feature request' },
  { value: 'data', label: 'Data correction' },
  { value: 'other', label: 'Other' },
]

export default function CouncilFeedback() {
  const { council } = useCouncil()
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim()) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/council/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message, page: '/council/feedback' }),
      })
      const data = await res.json().catch(() => ({}))
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

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{
          display: 'inline-block',
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'white', background: 'var(--color-sage)',
          padding: '3px 10px', borderRadius: 99, marginBottom: 10,
        }}>
          Beta
        </span>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400,
          color: 'var(--color-ink)', margin: '0 0 8px',
        }}>
          Send feedback
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.95rem', fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
        }}>
          You&apos;re a founding partner while Australian Atlas for councils is in beta &mdash; your feedback
          directly shapes what we build next. Spot something broken, missing, or a listing that needs
          correcting? Tell us. It goes straight to the founder.
        </p>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)',
        padding: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: '#f0fdf4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem', fontSize: '1.5rem',
            }}>
              <span style={{ color: '#166534' }}>&#10003;</span>
            </div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 400,
              color: 'var(--color-ink)', marginBottom: '0.5rem',
            }}>
              Thank you
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--color-muted)',
              lineHeight: 1.5, marginBottom: '1.25rem',
            }}>
              Your feedback has been sent. We read every note during the beta.
            </p>
            <button
              type="button"
              onClick={() => { setSubmitted(false); setMessage(''); setCategory('general') }}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 500,
                color: 'var(--color-sage)', background: 'none', border: 'none', cursor: 'pointer',
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}
            >
              Send more feedback
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>What kind of feedback?</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ ...inputStyle, appearance: 'auto' }}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Your feedback</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={6}
                placeholder="What's working, what isn't, what you'd like to see…"
                style={{ ...inputStyle, resize: 'vertical', minHeight: 140, lineHeight: 1.5 }}
              />
            </div>

            {error && (
              <div style={{
                padding: '0.625rem 0.875rem', borderRadius: 8,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !message.trim()}
              style={{
                width: '100%', padding: '0.8rem 1rem', borderRadius: 8, border: 'none',
                background: 'var(--color-sage)', color: '#fff',
                fontFamily: 'var(--font-body)', fontSize: '0.95rem', fontWeight: 500,
                cursor: (loading || !message.trim()) ? 'not-allowed' : 'pointer',
                opacity: (loading || !message.trim()) ? 0.7 : 1,
              }}
            >
              {loading ? 'Sending…' : 'Send feedback'}
            </button>

            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)',
              textAlign: 'center', marginTop: '1rem', marginBottom: 0, lineHeight: 1.5,
            }}>
              {council?.name ? `Sending as ${council.name}.` : 'Sending from your council account.'} We may reply to your account email.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
