/**
 * Tests the pending_verification chaser and the stalled-claim check.
 *
 * Plants a synthetic claim that has been waiting 20 days, then confirms:
 *   - phase 3 of claim-recovery finds it and (with sends off) reports it
 *   - claim-integrity raises verification_stalled for it
 *   - a claimant who HAS since verified is excluded from both
 *   - the stamp makes the nudge fire exactly once
 *
 * Fixtures are created and destroyed here; RESEND is blanked in the test env so
 * nothing can leave even if a send path is reached.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('/Users/matt/Desktop/Australian Atlas Websites/australian-atlas/.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = process.env.BASE_URL || 'http://localhost:3300'

let pass = 0, fail = 0
const check = (l, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${l}`) } else { fail++; console.log(`  FAIL  ${l}${d ? ` — ${d}` : ''}`) } }

const STAMP = 'stall1'
const STALLED_EMAIL = `stalled-${STAMP}@example.invalid`
const VERIFIED_EMAIL = `verified-${STAMP}@example.invalid`
const created = { listings: [], users: [], reviews: [] }

async function mkListing(suffix) {
  const { data, error } = await sb.from('listings').insert({
    name: `ZZ Stall Test ${suffix}`, slug: `zz-stall-test-${STAMP}-${suffix}`,
    vertical: 'sba', sub_type: 'winery', status: 'active', is_claimed: false,
    needs_review: true, hidden_reason: 'test_fixture',
    source_id: `stalltest-${STAMP}-${suffix}`, state: 'VIC',
  }).select('id, name').single()
  if (error) throw new Error(`listing: ${error.message}`)
  created.listings.push(data.id)
  return data
}

async function mkUser(email, confirm) {
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: confirm })
  if (error) throw new Error(`user ${email}: ${error.message}`)
  created.users.push(data.user.id)
  return data.user
}

async function mkPendingVerification(listing, email, userId, daysAgo) {
  const reviewedAt = new Date(Date.now() - daysAgo * 86400000).toISOString()
  const { data, error } = await sb.from('claims_review').insert({
    listing_id: listing.id, vertical: 'sba',
    claimant_name: 'Stall Tester', claimant_email: email, claimed_by: userId,
    tier: 'free', status: 'pending_verification',
    reviewed_at: reviewedAt, admin_notes: 'stall test',
  }).select('id').single()
  if (error) throw new Error(`review: ${error.message}`)
  created.reviews.push(data.id)
  return data
}

async function cleanup() {
  for (const id of created.reviews) await sb.from('claims_review').delete().eq('id', id)
  for (const id of created.listings) {
    await sb.from('listing_claims').delete().eq('listing_id', id)
    await sb.from('listing_activity').delete().eq('listing_id', id)
    await sb.from('listings').delete().eq('id', id)
  }
  for (const id of created.users) { await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id) }
  console.log('\nfixtures cleaned up')
}

const cron = async (name, qs = '') => {
  const r = await fetch(`${BASE}/api/cron/${name}${qs}`, { headers: { Authorization: 'Bearer localtest' } })
  return r.json()
}

try {
  console.log('Planting fixtures…')
  const lStalled = await mkListing('stalled')
  const lVerified = await mkListing('verified')
  const uStalled = await mkUser(STALLED_EMAIL, false)     // never confirmed
  const uVerified = await mkUser(VERIFIED_EMAIL, true)    // confirmed since
  const rStalled = await mkPendingVerification(lStalled, STALLED_EMAIL, uStalled.id, 20)
  const rVerified = await mkPendingVerification(lVerified, VERIFIED_EMAIL, uVerified.id, 20)
  console.log(`  stalled claim  ${rStalled.id}\n  verified claim ${rVerified.id}\n`)

  // ── 1. claim-integrity settles the verified one, flags the stalled one ──
  console.log('1. claim-integrity')
  const ci = await cron('claim-integrity')
  const stalledViolations = (ci.violations || []).filter(v => v.check === 'verification_stalled')
  check('verification_stalled raised for the stuck claim',
    stalledViolations.some(v => v.email === STALLED_EMAIL), JSON.stringify(stalledViolations.map(v => v.email)))
  check('NOT raised for the one that has since verified',
    !stalledViolations.some(v => v.email === VERIFIED_EMAIL))
  check('summary counts the stalled claim', (ci.summary?.verification_stalled || 0) >= 1, JSON.stringify(ci.summary))
  check('the verified claim was settled into ownership', (ci.summary?.settled_on_sweep || 0) >= 1, JSON.stringify(ci.summary))

  const { data: nowOwned } = await sb.from('listing_claims').select('id, status').eq('listing_id', lVerified.id)
  check('verified claimant now has an active ownership row', nowOwned?.length === 1 && nowOwned[0].status === 'active', JSON.stringify(nowOwned))
  const { data: stillNone } = await sb.from('listing_claims').select('id').eq('listing_id', lStalled.id)
  check('stalled claimant still has NO ownership row', (stillNone || []).length === 0)

  // ── 2. claim-recovery phase 3 finds the stalled claim ──
  console.log('\n2. claim-recovery phase 3')
  const cr = await cron('claim-recovery', '?dryRun=1')
  check('phase 3 reports at least one eligible claim', (cr.summary?.verification_eligible || 0) >= 1, JSON.stringify(cr.summary))
  const targeted = (cr.verification?.results || []).map(r => r.to)
  check('the stalled claimant is targeted', targeted.includes(STALLED_EMAIL), JSON.stringify(targeted))
  check('the since-verified claimant is NOT targeted', !targeted.includes(VERIFIED_EMAIL))
  check('dry run stamped nothing', cr.summary?.verification_sent === 0)

  const { data: unstamped } = await sb.from('claims_review').select('verification_nudge_sent_at').eq('id', rStalled.id).single()
  check('verification_nudge_sent_at still NULL after dry run', unstamped.verification_nudge_sent_at === null)

  // ── 3. Idempotency: a stamped claim is not chased twice ──
  console.log('\n3. Stamp prevents a second chase')
  await sb.from('claims_review').update({ verification_nudge_sent_at: new Date().toISOString() }).eq('id', rStalled.id)
  const cr2 = await cron('claim-recovery', '?dryRun=1')
  const targeted2 = (cr2.verification?.results || []).map(r => r.to)
  check('already-nudged claim is skipped', !targeted2.includes(STALLED_EMAIL), JSON.stringify(targeted2))

  // ── 4. Still visible to the integrity check even after nudging ──
  console.log('\n4. Nudged but still stuck stays audible')
  const ci2 = await cron('claim-integrity', '?dryRun=1')
  const v2 = (ci2.violations || []).filter(v => v.check === 'verification_stalled' && v.email === STALLED_EMAIL)
  check('still flagged after the nudge was spent', v2.length === 1, JSON.stringify(v2))
  check('the alert says it was already nudged', /nudged, still nothing/.test(v2[0]?.detail || ''), v2[0]?.detail)
} catch (err) {
  fail++
  console.error('\nTEST THREW:', err.message)
} finally {
  await cleanup()
}

console.log(`\n${'='.repeat(48)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(48)}`)
process.exit(fail ? 1 : 0)
