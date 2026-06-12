'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Admin tier controls for a GRANTED (approved) claim. Upgrade is a comped
// grant — Standard with no Stripe subscription — for payments taken outside
// Stripe or comps. Stripe-billed claims get no buttons here: their billing
// changes happen in Stripe (the webhook deactivates the claim on cancel).
export default function ClaimTierActions({ claimId, venueName, tier, hasStripeSubscription }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (tier === 'standard' && hasStripeSubscription) return null

  const targetTier = tier === 'free' ? 'standard' : 'free'
  const confirmMessage = targetTier === 'standard'
    ? `Upgrade ${venueName || 'this listing'} to Standard (paid tier)?\n\nThis unlocks all paid dashboard features without a Stripe subscription — use it when payment was taken outside Stripe, or as a comp. No email is sent.`
    : `Downgrade ${venueName || 'this listing'} back to Free?\n\nPaid dashboard features lock again immediately. No email is sent.`

  async function handleSetTier() {
    if (!window.confirm(confirmMessage)) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, action: 'set_tier', tier: targetTier }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Action failed')
        return
      }

      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {error && (
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 12,
          color: '#c44',
          margin: '0 0 8px',
        }}>
          {error}
        </p>
      )}

      {targetTier === 'standard' ? (
        <button
          onClick={handleSetTier}
          disabled={loading}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid #4a7c59',
            background: loading ? '#e8e8e8' : '#fff',
            color: loading ? '#888' : '#4a7c59',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 12,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Upgrading...' : 'Upgrade to Standard'}
        </button>
      ) : (
        <button
          onClick={handleSetTier}
          disabled={loading}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: loading ? '#888' : 'var(--color-muted, #888)',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 11,
            cursor: loading ? 'not-allowed' : 'pointer',
            textDecoration: 'underline',
          }}
        >
          {loading ? 'Downgrading...' : 'Downgrade to Free'}
        </button>
      )}
    </div>
  )
}
