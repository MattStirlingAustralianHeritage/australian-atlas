/**
 * Regression guard: the change must be invisible to everyone already claimed.
 *
 * Snapshots every live claim, runs the claim-integrity cron for real (which
 * carries the new verification backstop), and diffs. Nothing about an existing
 * operator's ownership, tier, role or review status may move.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('/Users/matt/Desktop/Australian Atlas Websites/australian-atlas/.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = process.env.BASE_URL || 'http://localhost:3200'

async function snapshot() {
  const { data: claims } = await sb.from('listing_claims')
    .select('id, listing_id, claimed_by, claimant_email, tier, status, source_review_id')
    .order('id').limit(500)
  const { data: reviews } = await sb.from('claims_review')
    .select('id, status, verified_at').order('id').limit(500)
  const { data: profiles } = await sb.from('profiles')
    .select('id, role, vendor_verticals').eq('role', 'vendor').order('id').limit(500)
  const { data: listings } = await sb.from('listings')
    .select('id, is_claimed').eq('is_claimed', true).order('id').limit(1000)
  return {
    claims: JSON.stringify(claims), reviews: JSON.stringify(reviews),
    profiles: JSON.stringify(profiles), listings: JSON.stringify(listings),
    counts: { claims: claims.length, vendors: profiles.length, claimedListings: listings.length },
  }
}

const before = await snapshot()
console.log('BEFORE:', JSON.stringify(before.counts))

const { data: ulist } = await sb.auth.admin.listUsers({ perPage: 2000 })
const byId = new Map((ulist?.users || []).map(u => [u.id, u]))
const live = JSON.parse(before.claims)
const verified = live.filter(c => byId.get(c.claimed_by)?.email_confirmed_at)
console.log(`live claims ${live.length} | verified ${verified.length} | unverified ${live.length - verified.length}`)

console.log('\nrunning claim-integrity (real, not dryRun) …')
const res = await fetch(`${BASE}/api/cron/claim-integrity`, { headers: { Authorization: 'Bearer localtest' } })
const json = await res.json()
console.log('summary:', JSON.stringify(json.summary))
console.log('violations:', JSON.stringify(json.violations))

const after = await snapshot()
console.log('\nAFTER: ', JSON.stringify(after.counts))

let fail = 0
const cmp = (label, a, b) => {
  if (a === b) console.log(`  PASS  ${label} unchanged`)
  else { fail++; console.log(`  FAIL  ${label} CHANGED`) }
}
console.log('\nDiff:')
cmp('listing_claims (ownership, tier, status)', before.claims, after.claims)
cmp('claims_review (status, verified_at)', before.reviews, after.reviews)
cmp('vendor profiles (role, verticals)', before.profiles, after.profiles)
cmp('listings.is_claimed set', before.listings, after.listings)

// The 25 verified operators specifically: still owned, still approved.
const stillOwned = JSON.parse(after.claims).filter(c => byId.get(c.claimed_by)?.email_confirmed_at)
if (stillOwned.length === verified.length) console.log(`  PASS  all ${verified.length} verified operators still hold their claim`)
else { fail++; console.log(`  FAIL  verified operators went ${verified.length} → ${stillOwned.length}`) }

console.log(`\n${fail ? `${fail} REGRESSION(S)` : 'no regressions'}`)
process.exit(fail ? 1 : 0)
