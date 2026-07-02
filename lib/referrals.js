// Referral codes for paid listing claims.
//
// Each active `standard` claim can carry one Stripe promotion code (stored on
// listing_claims.referral_code — migration 206). The code hangs off a single
// shared coupon 'atlas-referral-20' (20% off, duration 'once'), so a new
// operator can apply it at checkout for 20% off their first year and the
// redeemed promotion code identifies exactly which claim referred them.
//
// Everything here is lazy + idempotent: the coupon is created on first use,
// the promotion code is minted the first time the owning operator's dashboard
// asks for it, and re-calls return the stored code. Fails soft — a missing or
// misconfigured Stripe key returns null rather than throwing, so the
// dashboard never breaks over a billing hiccup.

import { getSupabaseAdmin } from './supabase/clients.js'

// Same shape validation as app/api/stripe/claim-checkout/route.js — a
// present-but-malformed key should fail loudly in the logs, not deep inside
// the first Stripe call with an opaque 401.
const STRIPE_SECRET_KEY_RE = /^(sk|rk)_(live|test)_/

export const REFERRAL_COUPON_ID = 'atlas-referral-20'
const CODE_PREFIX = 'ATLAS-'
const CODE_BODY_MAX = 12 // max chars after the prefix — alnum/dash only
const MAX_ATTEMPTS = 5   // base code + numeric-suffix retries on collision

function getStripe() {
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (!secretKey) {
    console.warn('[referrals] STRIPE_SECRET_KEY not set — referral codes unavailable')
    return null
  }
  if (!STRIPE_SECRET_KEY_RE.test(secretKey)) {
    console.error(
      '[referrals] STRIPE_SECRET_KEY is set but is not a valid Stripe secret key ' +
      '(it must start with sk_live_/sk_test_/rk_live_/rk_test_).'
    )
    return null
  }
  const Stripe = require('stripe')
  return new Stripe(secretKey)
}

// Create the shared 20%-off-once coupon if it doesn't exist yet. Percent-off
// coupons are currency-agnostic. Idempotent: retrieve first, tolerate the
// create/create race.
async function ensureReferralCoupon(stripe) {
  try {
    await stripe.coupons.retrieve(REFERRAL_COUPON_ID)
    return
  } catch (err) {
    if (err?.code !== 'resource_missing') throw err
  }
  try {
    await stripe.coupons.create({
      id: REFERRAL_COUPON_ID,
      percent_off: 20,
      duration: 'once',
      name: 'Atlas referral — 20% off first year',
    })
  } catch (err) {
    // Two concurrent callers both saw resource_missing — one wins, both proceed.
    if (err?.code === 'resource_already_exists' || /already exists/i.test(err?.message || '')) return
    throw err
  }
}

// Uppercase, alnum/dash only, no leading/trailing/doubled dashes, capped at
// `max` chars (re-trimmed so a truncation never leaves a trailing dash).
function slugToCodeBody(slug, max = CODE_BODY_MAX) {
  const body = String(slug || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '')
  return body
}

/**
 * Ensure a referral code exists for a claim, minting the Stripe coupon +
 * promotion code lazily on first call.
 *
 * @param {object} claim — a listing_claims row; must carry `id`; `referral_code`
 *   short-circuits when already set; `listing_id` (or `listing_slug`) is used
 *   to derive the code from the listing's slug.
 * @returns {Promise<string|null>} the code (e.g. 'ATLAS-THREE-BLUE'), or null
 *   when Stripe is unavailable / minting failed. Never throws.
 */
export async function ensureReferralCode(claim) {
  try {
    if (!claim?.id) return null
    if (claim.referral_code) return claim.referral_code

    const sb = getSupabaseAdmin()

    // Re-read defensively — the caller may hold a stale row and we must never
    // mint a second promotion code for the same claim.
    const { data: fresh } = await sb
      .from('listing_claims')
      .select('id, listing_id, referral_code')
      .eq('id', claim.id)
      .maybeSingle()
    if (!fresh) return null
    if (fresh.referral_code) return fresh.referral_code

    const stripe = getStripe()
    if (!stripe) return null

    await ensureReferralCoupon(stripe)

    // Derive the code body from the listing slug (passed in or looked up).
    let slug = claim.listing_slug || null
    if (!slug && fresh.listing_id) {
      const { data: listing } = await sb
        .from('listings')
        .select('slug')
        .eq('id', fresh.listing_id)
        .maybeSingle()
      slug = listing?.slug || null
    }
    // Fallback when the slug yields nothing usable: derive from the claim id.
    let base = slugToCodeBody(slug)
    if (!base) base = slugToCodeBody(String(claim.id).replace(/-/g, '').slice(0, 8))
    if (!base) return null

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const suffix = attempt === 1 ? '' : `-${attempt}`
      const body = attempt === 1
        ? base
        : `${slugToCodeBody(base, CODE_BODY_MAX - suffix.length)}${suffix}`
      const code = `${CODE_PREFIX}${body}`

      // 1. Mint in Stripe. A collision (someone else's venue slugs to the
      // same code) retries with a numeric suffix.
      try {
        await stripe.promotionCodes.create({
          coupon: REFERRAL_COUPON_ID,
          code,
          metadata: {
            type: 'atlas_referral',
            claim_id: String(claim.id),
            listing_id: fresh.listing_id ? String(fresh.listing_id) : '',
          },
        })
      } catch (err) {
        if (err?.code === 'resource_already_exists' || /already exists/i.test(err?.message || '')) {
          continue
        }
        throw err
      }

      // 2. Persist on the claim. Guarded update so a concurrent mint can't be
      // overwritten; the partial unique index (migration 206) backstops
      // cross-claim uniqueness.
      const { data: updated, error: updateErr } = await sb
        .from('listing_claims')
        .update({ referral_code: code, updated_at: new Date().toISOString() })
        .eq('id', claim.id)
        .is('referral_code', null)
        .select('referral_code')

      if (updateErr) {
        // 23505 = another claim already holds this exact code (index race) —
        // try the next suffix. Anything else is a real failure.
        if (updateErr.code === '23505') continue
        throw updateErr
      }

      if (updated && updated.length > 0) return code

      // No row updated: a concurrent call stored a code first — return theirs.
      const { data: winner } = await sb
        .from('listing_claims')
        .select('referral_code')
        .eq('id', claim.id)
        .maybeSingle()
      return winner?.referral_code || null
    }

    console.error(`[referrals] Could not mint a unique code for claim ${claim.id} after ${MAX_ATTEMPTS} attempts`)
    return null
  } catch (err) {
    console.error('[referrals] ensureReferralCode failed:', err?.message || err)
    return null
  }
}
