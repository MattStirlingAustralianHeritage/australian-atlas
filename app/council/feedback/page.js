'use client'

import { useCouncil } from '../layout'
import { useState } from 'react'
import { Card, PageHeader, Button } from '@/components/council/ui'

const CATEGORIES = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'feature', label: 'Feature request' },
  { value: 'data', label: 'Data correction' },
  { value: 'other', label: 'Other' },
]

const INPUT_STYLE = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.95rem',
  color: 'var(--color-ink)',
  background: 'var(--color-card-bg)',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: '0.82rem',
  fontWeight: 550,
  color: 'var(--color-muted)',
  marginBottom: '0.375rem',
}

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

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader
        title="Feedback"
        subtitle="You're a founding partner while Australian Atlas for councils is in beta — your feedback directly shapes what we build next. Spot something broken, missing, or a listing that needs correcting? Tell us. It goes straight to the founder."
      >
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: '#fff', background: 'var(--color-gold)',
          padding: '0.22rem 0.7rem', borderRadius: 999,
        }}>
          Beta
        </span>
      </PageHeader>

      <Card>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'rgba(95,138,126,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem', fontSize: '1.5rem',
            }}>
              <span style={{ color: 'var(--color-sage-dark)' }}>&#10003;</span>
            </div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 420,
              color: 'var(--color-ink)', margin: '0 0 0.5rem',
            }}>
              Thank you
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.92rem', color: 'var(--color-muted)',
              lineHeight: 1.5, margin: '0 0 1.25rem',
            }}>
              Your feedback has been sent. We read every note during the beta.
            </p>
            <Button
              variant="ghost"
              onClick={() => { setSubmitted(false); setMessage(''); setCategory('general') }}
            >
              Send more feedback
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="feedback-category" style={LABEL_STYLE}>What kind of feedback?</label>
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ ...INPUT_STYLE, appearance: 'auto' }}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="feedback-message" style={LABEL_STYLE}>Your feedback</label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={6}
                placeholder="What's working, what isn't, what you'd like to see…"
                style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: 140, lineHeight: 1.5 }}
              />
            </div>

            {error && (
              <div style={{
                padding: '0.625rem 0.875rem', borderRadius: 10,
                background: 'rgba(196,96,58,0.08)', border: '1px solid rgba(196,96,58,0.3)', color: 'var(--color-accent)',
                fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Button type="submit" variant="primary" disabled={loading || !message.trim()}>
                <span style={{ flex: 1, textAlign: 'center' }}>
                  {loading ? 'Sending…' : 'Send feedback'}
                </span>
              </Button>
            </div>

            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)',
              textAlign: 'center', marginTop: '1rem', marginBottom: 0, lineHeight: 1.5,
            }}>
              {council?.name ? `Sending as ${council.name}.` : 'Sending from your council account.'} We may reply to your account email.
            </p>
          </form>
        )}
      </Card>
    </div>
  )
}
