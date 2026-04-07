'use client'

import { useState } from 'react'

export default function ClaimForm({ listingId, slug, vertColor }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('owner')
  const [websiteDomain, setWebsiteDomain] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          slug,
          name: name.trim(),
          email: email.trim(),
          role,
          websiteDomain: websiteDomain.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      setSubmitted(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div
        className="text-center py-10 px-5 rounded-xl"
        style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
          style={{ background: vertColor + '18' }}
        >
          <svg className="w-6 h-6" fill="none" stroke={vertColor} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3
          className="mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '20px',
            color: 'var(--color-ink)',
          }}
        >
          Claim submitted
        </h3>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.5 }}>
          We'll review your claim and get back to you at <strong style={{ fontWeight: 500 }}>{email}</strong>.
          This usually takes 1-2 business days.
        </p>
      </div>
    )
  }

  const inputStyle = {
    fontFamily: 'var(--font-body)',
    fontSize: '14px',
    color: 'var(--color-ink)',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  const labelStyle = {
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    fontSize: '13px',
    color: 'var(--color-ink)',
    display: 'block',
    marginBottom: '6px',
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="claim-name" style={labelStyle}>
            Name <span style={{ color: vertColor }}>*</span>
          </label>
          <input
            id="claim-name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            style={inputStyle}
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="claim-email" style={labelStyle}>
            Email <span style={{ color: vertColor }}>*</span>
          </label>
          <input
            id="claim-email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        {/* Role */}
        <div>
          <label htmlFor="claim-role" style={labelStyle}>
            Relationship to listing <span style={{ color: vertColor }}>*</span>
          </label>
          <select
            id="claim-role"
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="marketing">Marketing / PR</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Website domain */}
        <div>
          <label htmlFor="claim-domain" style={labelStyle}>
            Website domain
            <span style={{ fontWeight: 300, color: 'var(--color-muted)', marginLeft: '6px' }}>(optional, for verification)</span>
          </label>
          <input
            id="claim-domain"
            type="text"
            value={websiteDomain}
            onChange={e => setWebsiteDomain(e.target.value)}
            placeholder="e.g. example.com.au"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-4" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: '#b44' }}>
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="mt-8 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: vertColor, fontFamily: 'var(--font-body)', cursor: submitting ? 'wait' : 'pointer' }}
      >
        {submitting ? 'Submitting...' : 'Submit claim'}
      </button>

      <p className="mt-4 text-center" style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 300, color: 'var(--color-muted)' }}>
        Claims are reviewed manually. We may contact you for verification.
      </p>
    </form>
  )
}
