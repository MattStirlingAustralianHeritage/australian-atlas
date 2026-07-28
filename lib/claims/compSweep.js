// Reconciliation for expired comped Standard terms.
//
// Split from lib/claims/comp.mjs deliberately: that module is the pure term
// logic (dependency-free, unit-tested under node --test); this is the database
// glue. Called by the claim-integrity cron every 6h.
//
// This is NOT the enforcement point. filterPaidListingIds (lib/listing-gallery.js)
// already treats a lapsed comp as unpaid the instant the term ends, whether or
// not this has run. What this does is make the STORED tier agree with what the
// gates already believe, so the admin UI, revenue reporting and anything else
// reading tier directly all see one truth.

import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'

/**
 * Downgrade every comped Standard claim whose term has run out.
 *
 * Only LIVE rows are touched: an inactive claim's tier is history, not state.
 *
 * @param {object} sb        master-portal Supabase client (service role)
 * @param {object} [options]
 * @param {boolean} [options.dryRun]  compute the working set, write nothing
 * @param {Date}   [options.now]
 * @returns {Promise<{ downgraded: Array, errors: Array }>}
 */
export async function sweepExpiredComps(sb, { dryRun = false, now = new Date() } = {}) {
  const downgraded = []
  const errors = []

  const { data: lapsed, error } = await sb
    .from('listing_claims')
    .select('id, listing_id, vertical, claimant_email, tier, status, comp_expires_at, comp_granted_at, comp_note, source_review_id, stripe_subscription_id, listings(name)')
    .eq('tier', 'standard')
    .is('stripe_subscription_id', null)
    .not('comp_expires_at', 'is', null)
    .lte('comp_expires_at', now.toISOString())
    .in('status', LIVE_CLAIM_STATUSES)

  if (error) {
    errors.push({ stage: 'query', error: error.message })
    return { downgraded, errors }
  }

  for (const row of lapsed || []) {
    const record = {
      claim_id: row.id,
      listing_id: row.listing_id,
      listing_name: row.listings?.name || null,
      vertical: row.vertical,
      claimant_email: row.claimant_email,
      expired_at: row.comp_expires_at,
      granted_at: row.comp_granted_at,
      note: row.comp_note,
    }

    if (dryRun) {
      downgraded.push(record)
      continue
    }

    // Clear the comp term along with the tier: the row is Free now, and a
    // stale expiry would re-fire this sweep on every pass.
    const { error: updErr } = await sb
      .from('listing_claims')
      .update({
        tier: 'free',
        comp_expires_at: null,
        comp_granted_at: null,
        comp_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('tier', 'standard') // no-op if something already changed it

    if (updErr) {
      errors.push({ stage: 'update', claim_id: row.id, error: updErr.message })
      continue
    }

    await sb.from('claim_audit_log').insert({
      claim_id: row.source_review_id || null,
      action: 'comp_expired',
      actor: 'system',
      details: { ...record, from_tier: 'standard', to_tier: 'free' },
    }).then(null, err => console.error('[comp-sweep] audit log error:', err.message))

    downgraded.push(record)
  }

  return { downgraded, errors }
}
