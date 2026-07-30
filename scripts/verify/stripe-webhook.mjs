// Verify the REAL Stripe webhook route with REAL Stripe-signed events.
//
// Why this exists: the cancellation and paid-claim paths could previously only
// be checked by simulating the database writes the handlers perform. That tests
// my understanding of the handler, not the handler. This drives the deployed
// route itself — signature verification, event dedupe, metadata routing, every
// branch — using payloads signed exactly the way Stripe signs them
// (HMAC-SHA256 over "<timestamp>.<body>", per Stripe's v1 scheme). No Stripe
// account, test mode, or network call is involved: the thing under test is our
// code, and Stripe's signing algorithm is a published constant.
//
// Run against a LOCAL server started with a known STRIPE_WEBHOOK_SECRET and a
// blank RESEND_API_KEY so nothing is emailed:
//
//   STRIPE_WEBHOOK_SECRET=whsec_localverifyonly RESEND_API_KEY= npm run dev -- -p 4472
//   VERIFY_BASE=http://localhost:4472 VERIFY_WEBHOOK_SECRET=whsec_localverifyonly \
//     node scripts/verify/stripe-webhook.mjs
//
// It writes to whatever database .env.local points at, using the retired
// Admin Test Roastery fixture, and restores it afterwards. Do not point it at a
// listing anyone owns.
//
// Two traps worth knowing, both of which produced false results while writing
// this:
//   * `mode: 'subscription'` is mandatory on a checkout.session — the
//     dispatcher bails before reading metadata otherwise, so every assertion
//     downstream passes because nothing ran.
//   * invoice.payment_failed calls stripe.subscriptions.retrieve() against the
//     REAL Stripe account, so the full past_due path needs a subscription that
//     actually exists. Only the retryable-not-swallowed half is asserted here.

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const ENV = process.argv[2] || '.env.local'
config({ path: ENV })

const URL_BASE = process.env.VERIFY_BASE || 'http://localhost:4472'
const SECRET = process.env.VERIFY_WEBHOOK_SECRET
if (!SECRET) throw new Error('VERIFY_WEBHOOK_SECRET must be set (must match the server)')

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const FIXTURE = 'c5f3b336-cae1-48ca-bd27-687605f4606e' // Admin Test Roastery
let pass = 0, fail = 0
const chk = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? ` (${JSON.stringify(actual)})` : `\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`))
  ok ? pass++ : fail++
}

/** Sign and POST an event exactly as Stripe would. */
async function send(event) {
  const body = JSON.stringify(event)
  const ts = Math.floor(Date.now() / 1000)
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')
  const res = await fetch(`${URL_BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` },
    body,
  })
  return { status: res.status, text: await res.text().catch(() => '') }
}

const uid = () => crypto.randomUUID().slice(0, 8)

async function resetFixture() {
  await db.from('listing_claims').delete().eq('listing_id', FIXTURE).neq('id', '22260058-b6b4-473d-9df3-f41d73648678')
  await db.from('listings').update({ status: 'active', needs_review: false, is_claimed: false, trade_welcome: false }).eq('id', FIXTURE)
}

// ── 0. Signature verification actually rejects a forgery ────────────────────
console.log('\n=== 0. an unsigned / wrongly-signed event is rejected ===')
{
  const body = JSON.stringify({ id: `evt_${uid()}`, type: 'customer.subscription.deleted', data: { object: {} } })
  const res = await fetch(`${URL_BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
    body,
  })
  chk('bad signature refused (400)', 400, res.status)
}

// ── 1. Cancellation downgrades and KEEPS ownership ──────────────────────────
console.log('\n=== 1. customer.subscription.deleted downgrades, ownership survives ===')
{
  await resetFixture()
  const subId = `sub_verify_${uid()}`
  const { data: claim } = await db.from('listing_claims').insert({
    listing_id: FIXTURE, vertical: 'fine_grounds', claimant_email: 'stripe-verify@example.com',
    tier: 'standard', status: 'active', stripe_subscription_id: subId, stripe_customer_id: 'cus_verify',
    claimed_at: new Date().toISOString(),
  }).select('id').single()
  // Opt this listing into Atlas Trade — a Standard perk that must be withdrawn.
  await db.from('listings').update({ trade_welcome: true, is_claimed: true }).eq('id', FIXTURE)

  const r = await send({
    id: `evt_${uid()}`, type: 'customer.subscription.deleted',
    data: { object: { id: subId, metadata: {} } },
  })
  chk('webhook accepted (200)', 200, r.status)

  const { data: after } = await db.from('listing_claims').select('tier,status,stripe_subscription_id,billing_cycle_end').eq('id', claim.id).single()
  chk('tier dropped to free', 'free', after.tier)
  chk('ownership SURVIVES (status still active)', 'active', after.status)
  chk('stripe subscription id cleared', null, after.stripe_subscription_id)
  const { data: l } = await db.from('listings').select('is_claimed,trade_welcome').eq('id', FIXTURE).single()
  chk('is_claimed SURVIVES', true, l.is_claimed)
  chk('Atlas Trade opt-in withdrawn', false, l.trade_welcome)
}

// ── 2. Event dedupe: the same event twice is processed once ─────────────────
console.log('\n=== 2. a redelivered event is not processed twice ===')
{
  await resetFixture()
  const subId = `sub_dedupe_${uid()}`
  const { data: claim } = await db.from('listing_claims').insert({
    listing_id: FIXTURE, vertical: 'fine_grounds', claimant_email: 'stripe-verify@example.com',
    tier: 'standard', status: 'active', stripe_subscription_id: subId,
    claimed_at: new Date().toISOString(),
  }).select('id').single()
  await db.from('listings').update({ is_claimed: true }).eq('id', FIXTURE)

  const evt = { id: `evt_dedupe_${uid()}`, type: 'customer.subscription.deleted', data: { object: { id: subId, metadata: {} } } }
  const r1 = await send(evt)
  // Re-arm: put it back on standard so a second processing WOULD be visible.
  await db.from('listing_claims').update({ tier: 'standard', stripe_subscription_id: subId }).eq('id', claim.id)
  const r2 = await send(evt)
  chk('first delivery 200', 200, r1.status)
  chk('redelivery 200', 200, r2.status)
  const { data: after } = await db.from('listing_claims').select('tier').eq('id', claim.id).single()
  chk('redelivery was SKIPPED (tier untouched the 2nd time)', 'standard', after.tier)
}

// ── 3. A rejected claim cannot be paid into ownership ───────────────────────
console.log('\n=== 3. payment against a REJECTED claim grants nothing ===')
{
  await resetFixture()
  const { data: review } = await db.from('claims_review').insert({
    listing_id: FIXTURE, vertical: 'fine_grounds', claimant_name: 'Rejected Payer',
    claimant_email: 'rejected-payer@example.com', tier: 'standard', status: 'rejected',
    admin_notes: 'stripe webhook verification',
  }).select('id').single()

  const r = await send({
    id: `evt_${uid()}`, type: 'checkout.session.completed',
    data: { object: {
      // mode MUST be 'subscription' — the dispatcher bails on anything else
      // before reading metadata, so omitting it makes every downstream
      // assertion pass for the wrong reason (nothing runs at all).
      id: `cs_${uid()}`, mode: 'subscription', subscription: `sub_rej_${uid()}`, customer: 'cus_rej',
      customer_details: { email: 'rejected-payer@example.com', name: 'Rejected Payer' },
      metadata: {
        type: 'atlas_claim_checkout', claim_id: review.id, listing_id: FIXTURE,
        vertical: 'fine_grounds', contact_email: 'rejected-payer@example.com', contact_name: 'Rejected Payer',
      },
    } },
  })
  chk('webhook settles (200, no endless retry)', 200, r.status)
  const { data: rv } = await db.from('claims_review').select('status').eq('id', review.id).single()
  chk('claim STAYS rejected (not overwritten to approved)', 'rejected', rv.status)
  const { data: claims } = await db.from('listing_claims').select('id').eq('listing_id', FIXTURE).in('status', ['active', 'past_due'])
  chk('no ownership row created', 0, claims.length)
  const { data: l } = await db.from('listings').select('is_claimed').eq('id', FIXTURE).single()
  chk('listing still unclaimed', false, l.is_claimed)
  await db.from('claims_review').delete().eq('id', review.id)
}

// ── 4. Payment with no resolvable claim must NOT settle silently ────────────
console.log('\n=== 4. payment with no matching claim throws so Stripe retries ===')
{
  await resetFixture()
  const r = await send({
    id: `evt_${uid()}`, type: 'checkout.session.completed',
    data: { object: {
      id: `cs_${uid()}`, mode: 'subscription', subscription: `sub_none_${uid()}`, customer: 'cus_none',
      customer_details: { email: 'nobody-has-claimed@example.com', name: 'Ghost' },
      metadata: {
        type: 'atlas_claim_checkout', listing_id: FIXTURE, vertical: 'fine_grounds',
        contact_email: 'nobody-has-claimed@example.com', contact_name: 'Ghost',
      },
    } },
  })
  chk('returns 5xx so Stripe will retry', true, r.status >= 500)
  const { data: claims } = await db.from('listing_claims').select('id').eq('listing_id', FIXTURE).in('status', ['active', 'past_due'])
  chk('nothing granted', 0, claims.length)
}

// ── 5. Dunning: an unresolvable invoice must not settle silently ────────────
//
// The full past_due path cannot be driven from here: the handler calls
// stripe.subscriptions.retrieve() to route on the subscription's metadata, so
// it needs a subscription that genuinely exists in the Stripe account. What IS
// worth asserting — and what this does assert — is that a payment_failed event
// the handler cannot resolve produces a retryable 5xx rather than a quiet 200.
// A silently-swallowed dunning event is an operator losing their grace period
// with nobody noticing.
console.log('\n=== 5. an unresolvable invoice.payment_failed is retryable, not swallowed ===')
{
  await resetFixture()
  const r = await send({
    id: `evt_${uid()}`, type: 'invoice.payment_failed',
    data: { object: { id: `in_${uid()}`, subscription: `sub_absent_${uid()}`, attempt_count: 1 } },
  })
  chk('returns 5xx so Stripe will retry', true, r.status >= 500)
}

// ── 6. An unrecognised checkout type is ignored gracefully ─────────────────
console.log('\n=== 6. an unknown metadata.type is ignored, not an error ===')
{
  const r = await send({
    id: `evt_${uid()}`, type: 'checkout.session.completed',
    data: { object: { id: `cs_${uid()}`, mode: 'subscription', subscription: `sub_x_${uid()}`, metadata: { type: 'something_we_do_not_handle' } } },
  })
  chk('accepted without error', 200, r.status)
}

// ── 7. A non-subscription checkout is ignored (one-off payments) ───────────
console.log('\n=== 7. a one-off (mode=payment) checkout is ignored ===')
{
  const r = await send({
    id: `evt_${uid()}`, type: 'checkout.session.completed',
    data: { object: { id: `cs_${uid()}`, mode: 'payment', metadata: { type: 'atlas_claim_checkout', listing_id: FIXTURE } } },
  })
  chk('accepted without granting anything', 200, r.status)
  const { data: claims } = await db.from('listing_claims').select('id').eq('listing_id', FIXTURE).in('status', ['active', 'past_due'])
  chk('no ownership row created', 0, claims.length)
}

// ── Cleanup ────────────────────────────────────────────────────────────────
await resetFixture()
await db.from('listings').update({ status: 'inactive', needs_review: true, is_claimed: false, trade_welcome: false }).eq('id', FIXTURE)
const { data: leftover } = await db.from('listing_claims').select('id,status').eq('listing_id', FIXTURE)
console.log('\nfixture restored; claims on fixture:', JSON.stringify(leftover))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
