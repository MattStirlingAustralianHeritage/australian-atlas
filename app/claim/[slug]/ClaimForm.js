'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

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
  // Identity. A claim now starts from a signed-in account, so the email is
  // something we already know rather than something the visitor asserts.
  // `authChecked` keeps the form from flashing the wrong panel on first paint.
  const [sessionEmail, setSessionEmail] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)

  useEffect(() => {
    getAuthSupabase().auth.getUser()
      .then(({ data: { user } }) => {
        if (user?.email) { setSessionEmail(user.email); setEmail(user.email) }
      })
      .catch(() => { /* treat as signed out */ })
      .finally(() => setAuthChecked(true))
  }, [])

  // Sign-in step: mail a magic link to the address being claimed, returning
  // the operator to this exact claim page once they land. The address they
  // verify here is the address the claim will carry — that is the whole point.
  async function handleSendLink(e) {
    e.preventDefault()
    setError(null)
    setSendingLink(true)
    try {
      const res = await fetch('/api/auth/email-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'magiclink', email: linkEmail.trim(), next: `/claim/${slug}` }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not send your sign-in link. Please try again.'); return }
      setLinkSent(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSendingLink(false)
    }
  }

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
        // The session lapsed between page load and submit (or was never there).
        // Drop back to the sign-in step rather than showing a dead error — the
        // claim itself is still valid, it just needs an identity behind it.
        if (data.code === 'auth_required') {
          setSessionEmail(null)
          setLinkEmail(email.trim())
          setError('Please confirm your email address to continue — we\'ll send you a sign-in link.')
          return
        }
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

  const panelStyle = { background: 'var(--color-cream)', border: '1px solid var(--color-border)' }
  const headingStyle = {
    fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px', color: 'var(--color-ink)',
  }
  const bodyStyle = {
    fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 300,
    color: 'var(--color-muted)', lineHeight: 1.5,
  }

  // Don't paint either branch until we know which one is right — a flash of
  // "sign in" to an already-signed-in operator reads as being logged out.
  if (!authChecked) {
    return (
      <div className="text-center py-10 px-5 rounded-xl" style={panelStyle}>
        <p style={bodyStyle}>Loading…</p>
      </div>
    )
  }

  // ── Sign-in gate ──
  // No account, no claim. Verifying the address here is what makes the claim
  // mean something: by the time an admin sees it, the person has already
  // proven they can read mail at the address they are claiming from.
  if (!sessionEmail) {
    if (linkSent) {
      return (
        <div className="text-center py-10 px-5 rounded-xl" style={panelStyle}>
          <h3 className="mb-2" style={headingStyle}>Check your email</h3>
          <p style={bodyStyle}>
            We&rsquo;ve sent a sign-in link to <strong style={{ fontWeight: 500 }}>{linkEmail}</strong>.
            Open it and you&rsquo;ll come straight back here to finish claiming{' '}
            <strong style={{ fontWeight: 500 }}>{listingName}</strong>.
          </p>
        </div>
      )
    }
    return (
      <form onSubmit={handleSendLink} className="py-8 px-5 rounded-xl" style={panelStyle}>
        <h3 className="mb-2" style={headingStyle}>First, confirm your email</h3>
        <p className="mb-4" style={bodyStyle}>
          To claim <strong style={{ fontWeight: 500 }}>{listingName}</strong> we need to know the claim is
          really coming from you. Enter your email and we&rsquo;ll send a sign-in link — no password to set up.
        </p>
        <label htmlFor="claim-link-email" className="block mb-1" style={{ ...bodyStyle, color: 'var(--color-ink)' }}>
          Your email address
        </label>
        <input
          id="claim-link-email"
          type="email"
          required
          value={linkEmail}
          onChange={(e) => setLinkEmail(e.target.value)}
          placeholder="you@yourvenue.com.au"
          className="w-full px-3 py-2 rounded-lg mb-3"
          style={{ border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: '14px' }}
        />
        {error && (
          <p className="mb-3" style={{ ...bodyStyle, color: '#b91c1c' }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={sendingLink || !linkEmail.trim()}
          className="w-full py-2.5 rounded-lg"
          style={{
            background: vertColor, color: '#fff', fontFamily: 'var(--font-body)',
            fontSize: '14px', fontWeight: 500, opacity: sendingLink || !linkEmail.trim() ? 0.6 : 1,
          }}
        >
          {sendingLink ? 'Sending…' : 'Send me a sign-in link'}
        </button>
      </form>
    )
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
          {/* Read-only: this is the verified session address, and the server
              rejects any claim whose email differs from it. Leaving it editable
              would only invite a 403 the operator can't act on. */}
          <input
            id="claim-email"
            type="email"
            required
            readOnly
            value={email}
            style={{ ...inputStyle, background: 'var(--color-cream)', cursor: 'not-allowed' }}
          />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 300, color: 'var(--color-muted)', marginTop: 4 }}>
            Signed in as {sessionEmail}. Your claim will be tied to this address.
          </p>
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
        className="mt-8 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
