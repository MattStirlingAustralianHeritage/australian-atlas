'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TIERS = [
  {
    id: 'free',
    name: 'Free Listing',
    price: 0,
    description: 'Claim and verify your listing with basic details.',
    features: ['Verify ownership', 'Basic listing', 'Appear in search & trails'],
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 295,
    description: 'Full listing management with all features.',
    features: ['Everything in Free', 'Photo gallery', 'Website & social links', 'Listing Insights', 'Producer Picks'],
    recommended: true,
  },
]

export default function ClaimForm({ listingId, listingName, slug, vertColor }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('owner')
  const [tier, setTier] = useState('free')
  const [websiteDomain, setWebsiteDomain] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [paymentPending, setPaymentPending] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      // Step 1: Submit the claim
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          slug,
          name: name.trim(),
          email: email.trim(),
          role,
          tier,
          websiteDomain: websiteDomain.trim() || null,
          website: honeypot || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      // Step 2: If Standard tier, redirect to Stripe checkout
      if (tier === 'standard') {
        const checkoutRes = await fetch('/api/stripe/claim-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimId: data.claimId || null,
            listingId,
            listingName: listingName,
            listingSlug: slug,
            name: name.trim(),
            email: email.trim(),
          }),
        })

        let checkoutData = {}
        try { checkoutData = await checkoutRes.json() } catch { /* non-JSON error body */ }

        if (checkoutRes.ok && checkoutData.url) {
          window.location.href = checkoutData.url
          return
        }

        // Instant card checkout couldn't start (e.g. Stripe temporarily
        // misconfigured). The claim itself ALREADY succeeded server-side in
        // step 1 — it's saved as pending and both the claimant and our team
        // were emailed — so this is NOT a failed submission. Show an honest
        // "received, payment to follow" confirmation (NOT a "you're on Standard
        // now" success — the listing stays unclaimed until payment clears) so
        // the operator isn't dead-ended. When the Stripe key is valid the
        // redirect above fires and they pay inline.
        console.error('Stripe instant checkout unavailable; claim captured for manual payment follow-up:', checkoutData.error)
        setPaymentPending(true)
        return
      }

      router.push('/claim/success')
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

  if (paymentPending) {
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
          Claim received
        </h3>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.5 }}>
          Thanks — your claim for <strong style={{ fontWeight: 500 }}>{listingName}</strong> is in, and we've
          emailed a confirmation to <strong style={{ fontWeight: 500 }}>{email}</strong>. To activate your
          Standard ($295/yr) listing we'll follow up with a secure payment link. Questions? Email{' '}
          <a href="mailto:listings@australianatlas.com.au" style={{ color: vertColor, fontWeight: 500 }}>
            listings@australianatlas.com.au
          </a>.
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
      {/* Honeypot — hidden from real users, auto-filled by bots */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={e => setHoneypot(e.target.value)}
        />
      </div>

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

        {/* Tier selection */}
        <div>
          <label style={labelStyle}>
            Listing tier
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {TIERS.map(t => (
              <div
                key={t.id}
                onClick={() => setTier(t.id)}
                style={{
                  border: `1px solid ${tier === t.id ? vertColor : 'var(--color-border)'}`,
                  borderRadius: '10px',
                  padding: '16px 14px',
                  cursor: 'pointer',
                  background: tier === t.id ? vertColor + '08' : 'var(--color-bg)',
                  transition: 'all 0.15s',
                  position: 'relative',
                }}
              >
                {t.recommended && (
                  <span style={{
                    position: 'absolute',
                    top: -9,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: vertColor,
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '2px 10px',
                    borderRadius: '20px',
                    fontFamily: 'var(--font-body)',
                    whiteSpace: 'nowrap',
                  }}>
                    Recommended
                  </span>
                )}
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontSize: '15px',
                  color: 'var(--color-ink)',
                  margin: '0 0 2px',
                }}>
                  {t.name}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: '18px',
                  color: 'var(--color-ink)',
                  margin: '0 0 8px',
                }}>
                  {t.price === 0 ? 'Free' : `$${t.price}/yr`}
                </p>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: '12px',
                  color: 'var(--color-muted)',
                  margin: '0 0 8px',
                  lineHeight: 1.4,
                }}>
                  {t.description}
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {t.features.map(f => (
                    <li key={f} style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 300,
                      fontSize: '11px',
                      color: 'var(--color-muted)',
                      padding: '1px 0',
                    }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Link to the full paid-listing benefits page */}
          <p style={{ textAlign: 'center', marginTop: '14px' }}>
            <a
              href="/for-venues"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                fontWeight: 500,
                color: vertColor,
                textDecoration: 'none',
                borderBottom: `1px solid ${vertColor}40`,
                paddingBottom: '1px',
              }}
            >
              See everything a paid listing includes →
            </a>
          </p>
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
        {submitting ? 'Submitting...' : tier === 'standard' ? 'Submit claim ($295/yr)' : 'Submit claim (free)'}
      </button>

      <p className="mt-4 text-center" style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 300, color: 'var(--color-muted)' }}>
        Claims are reviewed manually. We may contact you for verification.
      </p>
    </form>
  )
}
