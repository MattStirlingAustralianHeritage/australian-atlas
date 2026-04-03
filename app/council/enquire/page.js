'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const PLANS = [
  { value: 'explorer', label: 'Explorer — $249/year' },
  { value: 'partner', label: 'Partner — $3,500/year' },
  { value: 'enterprise', label: 'Enterprise — $8,500/year' },
]

export default function CouncilEnquirePage() {
  return (
    <Suspense fallback={null}>
      <CouncilEnquireForm />
    </Suspense>
  )
}

function CouncilEnquireForm() {
  const searchParams = useSearchParams()
  const preselectedPlan = searchParams.get('plan') || ''

  const [form, setForm] = useState({
    name: '',
    organisation: '',
    email: '',
    region: '',
    plan: preselectedPlan,
    message: '',
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
      const res = await fetch('/api/council/enquire', {
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 400,
              marginBottom: '0.25rem',
            }}>
              Australian Atlas
            </h1>
          </Link>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
            marginBottom: '0.75rem',
          }}>
            Council & Tourism Portal
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.95rem',
            color: 'var(--color-muted)',
            lineHeight: 1.5,
          }}>
            Interested in the council portal? Tell us about your organisation and we'll be in touch.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
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
                Enquiry received
              </h2>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.95rem',
                color: 'var(--color-muted)',
                lineHeight: 1.5,
              }}>
                Thanks — we'll be in touch within 2 business days.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Full name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  required
                  placeholder="Jane Smith"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Council or organisation name</label>
                <input
                  type="text"
                  value={form.organisation}
                  onChange={(e) => update('organisation', e.target.value)}
                  required
                  placeholder="Yarra Ranges Council"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Email address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  required
                  placeholder="jane@council.gov.au"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Region</label>
                <input
                  type="text"
                  value={form.region}
                  onChange={(e) => update('region', e.target.value)}
                  required
                  placeholder="e.g. Yarra Valley, Byron Bay, Barossa"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Plan of interest</label>
                <select
                  value={form.plan}
                  onChange={(e) => update('plan', e.target.value)}
                  required
                  style={{
                    ...inputStyle,
                    appearance: 'auto',
                  }}
                >
                  <option value="">Select a plan</option>
                  {PLANS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Message (optional)</label>
                <textarea
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                  rows={3}
                  placeholder="Anything else you'd like us to know?"
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    minHeight: '80px',
                  }}
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
                {loading ? 'Sending...' : 'Submit enquiry'}
              </button>
            </form>
          )}
        </div>

        {/* Bottom link */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--color-muted)',
          }}>
            Existing account?{' '}
            <Link href="/council/login" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
