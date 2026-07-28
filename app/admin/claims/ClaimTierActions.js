'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { COMP_DURATIONS, DEFAULT_COMP_DURATION, compDurationLabel } from '@/lib/claims/comp.mjs'

// Admin tier controls for a GRANTED claim. Upgrade is a COMPED grant —
// Standard with no Stripe subscription — for payments taken outside Stripe or
// genuine comps. Stripe-billed claims get no buttons here: their billing
// changes happen in Stripe (the webhook deactivates the claim on cancel).
//
// The comp now carries a TERM, chosen here: one month through to in perpetuity
// (migration 261). Perpetual is still on offer and is exactly what every comp
// used to be by default — the difference is that it is now a decision rather
// than an accident. A running comp can be re-termed at any time from the same
// control: pick a new duration and it is recomputed from today.
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [duration, setDuration] = useState(DEFAULT_COMP_DURATION)
  const [retermOpen, setRetermOpen] = useState(false)

  if (tier === 'standard' && hasStripeSubscription) return null

  const isComped = tier === 'standard'
  const remaining = daysUntil(compExpiresAt)
  const venue = venueName || 'this listing'

  async function submit({ targetTier, targetDuration, confirmMessage }) {
    if (confirmMessage && !window.confirm(confirmMessage)) return
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
          duration: targetDuration || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Action failed')
        return
      }

      setRetermOpen(false)
      if (onChanged) onChanged()
      else router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  function grant(targetDuration) {
    const label = compDurationLabel(targetDuration)
    const term = targetDuration === 'perpetual'
      ? 'It will NOT expire — Standard stays on until someone downgrades it here.'
      : `It runs for ${label} and then drops back to Free automatically.`
    return submit({
      targetTier: 'standard',
      targetDuration,
      confirmMessage:
        `Give ${venue} Standard for ${label}?\n\n` +
        'This unlocks all paid dashboard features with no Stripe subscription — use it for payment taken outside Stripe, or as a comp. ' +
        `${term}\n\nNo email is sent.`,
    })
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

      {!isComped ? (
        // ── Free: pick a term, then grant ──
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <DurationSelect value={duration} onChange={setDuration} disabled={loading} />
          <button onClick={() => grant(duration)} disabled={loading} style={primaryButton(loading)}>
            {loading ? 'Granting…' : 'Grant Standard'}
          </button>
        </div>
      ) : (
        // ── Comped Standard: show the term, allow re-terming or downgrade ──
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
            {retermOpen ? (
              <>
                <DurationSelect value={duration} onChange={setDuration} disabled={loading} />
                <button onClick={() => grant(duration)} disabled={loading} style={primaryButton(loading)}>
                  {loading ? 'Saving…' : 'Set term'}
                </button>
                <button onClick={() => setRetermOpen(false)} disabled={loading} style={linkButton(loading)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setRetermOpen(true)} disabled={loading} style={secondaryButton(loading)}>
                  Change term
                </button>
                <button
                  onClick={() => submit({
                    targetTier: 'free',
                    confirmMessage: `Downgrade ${venue} back to Free?\n\nPaid dashboard features lock again immediately, and the comp term is cleared. No email is sent.`,
                  })}
                  disabled={loading}
                  style={linkButton(loading)}
                >
                  {loading ? 'Working…' : 'Downgrade to Free'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DurationSelect({ value, onChange, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Comp duration"
      style={{
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid var(--color-border, #ddd)',
        background: '#fff',
        color: 'var(--color-ink, #222)',
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {COMP_DURATIONS.map(d => (
        <option key={d.key} value={d.key}>{d.label}</option>
      ))}
    </select>
  )
}

// ─── Shared button styling ────────────────────────────────

function primaryButton(loading) {
  return {
    padding: '6px 16px',
    borderRadius: 6,
    border: '1px solid #4a7c59',
    background: loading ? '#e8e8e8' : '#fff',
    color: loading ? '#888' : '#4a7c59',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 12,
    fontWeight: 500,
    cursor: loading ? 'not-allowed' : 'pointer',
  }
}

function secondaryButton(loading) {
  return {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--color-border, #ddd)',
    background: '#fff',
    color: loading ? '#888' : 'var(--color-ink, #222)',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 12,
    cursor: loading ? 'not-allowed' : 'pointer',
  }
}

function linkButton(loading) {
  return {
    padding: '6px 4px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: loading ? '#888' : 'var(--color-muted, #888)',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 11,
    cursor: loading ? 'not-allowed' : 'pointer',
    textDecoration: 'underline',
  }
}
