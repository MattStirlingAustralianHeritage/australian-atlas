'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Take a granted claim back.
//
// The platform had no way to do this: the only code that ever deactivated an
// ownership row was the Stripe cancellation webhook, so a claim granted to the
// wrong person — which the pre-verification-gate cohort is full of — needed
// hand-written SQL. The ordering trap (migration 256 coerces is_claimed back to
// true while a live claim exists) lives in the API handler, not here.
//
// Deliberately two clicks with the owner's address typed out in the confirm:
// revoking is how a legitimate operator loses their listing, so it should be
// hard to do by accident and impossible to do without reading who it hits.
export default function RevokeClaimAction({ claimId, listingId, venueName, ownerEmail, hasStripeSubscription }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function revoke() {
    const warning = `Revoke ownership of ${venueName || 'this listing'} from ${ownerEmail || 'its current owner'}?\n\n` +
      'They lose the dashboard and the listing becomes claimable again. This is not reversible from the console.'
    if (!window.confirm(warning)) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, listingId, action: 'revoke' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Revoke failed')
        return
      }
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(false)
    }
  }

  // A Stripe-billed claim must be cancelled in Stripe first (the API refuses
  // it too) — say so here rather than offering a button that 409s.
  if (hasStripeSubscription) {
    return (
      <p style={{
        fontFamily: 'var(--font-body, system-ui)', fontSize: 11,
        color: 'var(--color-muted, #888)', margin: '8px 0 0',
      }}>
        Billed through Stripe — cancel the subscription there to end this plan.
      </p>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      {error && (
        <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: '#c44', margin: '0 0 6px' }}>
          {error}
        </p>
      )}
      <button
        onClick={revoke}
        disabled={busy}
        style={{
          padding: '5px 12px',
          borderRadius: 6,
          border: '1px solid #d9c2c2',
          background: '#fff',
          color: busy ? '#888' : '#a44',
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 11,
          fontWeight: 500,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Revoking…' : 'Revoke ownership'}
      </button>
    </div>
  )
}
