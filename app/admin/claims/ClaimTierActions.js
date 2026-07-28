'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CompTermDialog from './CompTermDialog'

// Admin tier controls for a GRANTED claim. Upgrade is a COMPED grant —
// Standard with no Stripe subscription — for payments taken outside Stripe or
// genuine comps. Stripe-billed claims get no buttons here: their billing
// changes happen in Stripe (the webhook deactivates the claim on cancel).
//
// The card carries ONE button. The term (1 month … in perpetuity, migration
// 261) is chosen in CompTermDialog, not from a dropdown parked on every row —
// the queue renders ~48 of these and a select on each turned the page into a
// wall of form controls.
//
// Addressed by listingId where available (search results act on listings, which
// need not have a moderation row), falling back to the claims_review id.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Deterministic across server render and client hydration — toLocaleDateString
// would risk a mismatch, since this is a client component inside a server page.
function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function daysUntil(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

export default function ClaimTierActions({
  claimId,
  listingId,
  venueName,
  tier,
  hasStripeSubscription,
  compExpiresAt = null,
  compNote = null,
  onChanged,
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null) // null | 'grant' | 'downgrade'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (tier === 'standard' && hasStripeSubscription) return null

  const isComped = tier === 'standard'
  const remaining = daysUntil(compExpiresAt)

  async function submit({ targetTier, duration, note }) {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: claimId || null,
          listingId: listingId || null,
          action: 'set_tier',
          tier: targetTier,
          duration: duration || null,
          note: note || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Action failed')
        return
      }

      setDialog(null)
      if (onChanged) onChanged()
      else router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  function closeDialog() {
    setDialog(null)
    setError(null)
  }

  return (
    <div style={{ marginTop: 10 }}>
      {/* Errors surface inside the dialog while it's open; this catches the
          rare case where it closed before the failure was read. */}
      {error && !dialog && (
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 12,
          color: '#b3453f',
          margin: '0 0 8px',
        }}>
          {error}
        </p>
      )}

      {!isComped ? (
        <button onClick={() => setDialog('grant')} style={grantButton}>
          Grant Standard
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 12,
              fontWeight: 500,
              color: '#4a7c59',
            }}>
              {compExpiresAt
                ? `Comped Standard until ${formatDate(compExpiresAt)}`
                : 'Comped Standard — in perpetuity'}
            </span>
            {compExpiresAt && remaining !== null && (
              <span style={{
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: 11,
                color: remaining <= 14 ? '#b08030' : 'var(--color-muted, #888)',
              }}>
                {remaining <= 0 ? 'term has run out' : `${remaining} day${remaining === 1 ? '' : 's'} left`}
              </span>
            )}
            {compNote && (
              <span style={{
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: 11,
                fontStyle: 'italic',
                color: 'var(--color-muted, #888)',
              }}>
                {compNote}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setDialog('grant')} style={secondaryButton}>
              Change term
            </button>
            <button onClick={() => setDialog('downgrade')} style={linkButton}>
              Downgrade to Free
            </button>
          </div>
        </div>
      )}

      {dialog && (
        <CompTermDialog
          mode={dialog}
          venueName={venueName}
          currentExpiresAt={isComped ? compExpiresAt : null}
          isRetermimg={isComped}
          loading={loading}
          error={error}
          onCancel={closeDialog}
          onConfirm={({ duration, note }) =>
            submit(
              dialog === 'downgrade'
                ? { targetTier: 'free' }
                : { targetTier: 'standard', duration, note }
            )
          }
        />
      )}
    </div>
  )
}

// ─── Button styling ───────────────────────────────────────

const grantButton = {
  padding: '7px 16px',
  borderRadius: 7,
  border: '1px solid #4a7c59',
  background: '#4a7c59',
  color: '#fff',
  fontFamily: 'var(--font-body, system-ui)',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
}

const secondaryButton = {
  padding: '6px 13px',
  borderRadius: 7,
  border: '1px solid var(--color-border, #ddd)',
  background: '#fff',
  color: 'var(--color-ink, #222)',
  fontFamily: 'var(--font-body, system-ui)',
  fontSize: 12,
  cursor: 'pointer',
}

const linkButton = {
  padding: '6px 4px',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-muted, #888)',
  fontFamily: 'var(--font-body, system-ui)',
  fontSize: 11,
  cursor: 'pointer',
  textDecoration: 'underline',
}
