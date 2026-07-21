#!/usr/bin/env node

/**
 * verify-lockout-infra.mjs — proves the lockout-prevention stack against the
 * LIVE deployment, from outside it. Run after any deploy that touches auth,
 * claims, sync, or the dashboard.
 *
 *   1. Auth-canary probes (same logic as /api/cron/auth-canary): mint a real
 *      recovery token for the inert canary account, follow the production
 *      /auth/callback, and assert it lands on /auth/update-password; check the
 *      page renders; check magic links mint.
 *   2. Claim-integrity checks 1–6 (same queries as /api/cron/claim-integrity)
 *      in dry-run: report violation counts, never emails.
 *
 * Prints statuses only — never env values. Exit 0 = all green.
 *
 * Usage: node scripts/verify-lockout-infra.mjs
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
const CANARY_EMAIL = process.env.AUTH_CANARY_EMAIL || 'auth-canary@australianatlas.com.au'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not present in env')
  process.exit(1)
}
const sb = createClient(url, key)
const results = []
const ok = (name, detail) => { results.push([true, name, detail]); console.log(`  ✅ ${name}: ${detail}`) }
const bad = (name, detail) => { results.push([false, name, detail]); console.log(`  ❌ ${name}: ${detail}`) }
const rnd = () => `Canary-${crypto.randomUUID()}-${crypto.randomUUID()}`

console.log(`\n── Auth-canary probes against ${SITE_URL} ──`)

// 1. recovery link (create the canary on first ever run)
let link = await sb.auth.admin.generateLink({
  type: 'recovery', email: CANARY_EMAIL,
  options: { redirectTo: `${SITE_URL}/auth/callback?next=%2Faccount` },
})
if (link.error && (link.error.status === 404 || /not found/i.test(link.error.message || ''))) {
  const { error: cErr } = await sb.auth.admin.createUser({
    email: CANARY_EMAIL, password: rnd(), email_confirm: true,
    user_metadata: { atlas_canary: true },
  })
  if (cErr) bad('canary_user', `createUser: ${cErr.message}`)
  else {
    ok('canary_user', 'created')
    link = await sb.auth.admin.generateLink({
      type: 'recovery', email: CANARY_EMAIL,
      options: { redirectTo: `${SITE_URL}/auth/callback?next=%2Faccount` },
    })
  }
} else ok('canary_user', 'exists')

const hashedToken = link.data?.properties?.hashed_token
const canaryUserId = link.data?.user?.id || null
if (link.error || !hashedToken) bad('recovery_link', link.error?.message || 'no hashed_token')
else {
  ok('recovery_link', 'token minted')
  // 2. THE invariant: recovery must land on the set-password screen
  const res = await fetch(`${SITE_URL}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=%2Faccount`, { redirect: 'manual' })
  const loc = res.headers.get('location') || ''
  let landing = ''
  try { landing = new URL(loc, SITE_URL).pathname } catch { landing = loc }
  if (res.status >= 300 && res.status < 400 && landing === '/auth/update-password') {
    ok('callback_redirect', `${res.status} → ${landing}`)
  } else {
    bad('callback_redirect', `expected 3xx → /auth/update-password, got ${res.status} → ${loc || '(none)'}`)
  }
}

// 3. page renders
try {
  const res = await fetch(`${SITE_URL}/auth/update-password`)
  const body = res.ok ? await res.text() : ''
  if (res.ok && body.includes('Choose a new password')) ok('update_password_page', '200 + copy present')
  else bad('update_password_page', res.ok ? 'copy missing' : `HTTP ${res.status}`)
} catch (e) { bad('update_password_page', e.message) }

// 4. magic links mint
const magic = await sb.auth.admin.generateLink({
  type: 'magiclink', email: CANARY_EMAIL,
  options: { redirectTo: `${SITE_URL}/auth/callback?next=%2Faccount` },
})
if (magic.error || !magic.data?.properties?.hashed_token) bad('magiclink', magic.error?.message || 'no token')
else ok('magiclink', 'token minted (not followed)')

// rotate the canary password so the account stays inert
if (canaryUserId) await sb.auth.admin.updateUserById(canaryUserId, { password: rnd() }).catch(() => {})

console.log('\n── Claim-integrity dry run (checks 1–6) ──')
const { data: liveClaims, error: lcErr } = await sb
  .from('listing_claims')
  .select('id, listing_id, claimed_by, claimant_email, tier, status, listings(id, name, vertical, is_claimed, status)')
  .in('status', ['active', 'past_due'])
if (lcErr) { bad('live_claims_query', lcErr.message); report() }

const violations = []
const byListing = new Map()
for (const c of liveClaims || []) {
  const l = c.listings
  if (!l) violations.push(['flag_trampled', `claim ${c.id} has no joinable listing`])
  else {
    if (l.is_claimed !== true) violations.push(['flag_trampled', `${l.name}: is_claimed=${l.is_claimed}`])
    if (l.status !== 'active') violations.push(['listing_hidden', `${l.name}: status=${l.status}`])
  }
  byListing.set(c.listing_id, (byListing.get(c.listing_id) || 0) + 1)
}
for (const [id, n] of byListing) if (n > 1) violations.push(['duplicate_live', `listing ${id}: ${n} live claims`])

const { data: approved } = await sb
  .from('claims_review').select('id, listing_id, claimant_email').eq('status', 'approved').not('listing_id', 'is', null)
const approvedIds = [...new Set((approved || []).map(a => a.listing_id))]
const anyClaim = new Set()
for (let i = 0; i < approvedIds.length; i += 100) {
  const { data: rows } = await sb.from('listing_claims').select('listing_id').in('listing_id', approvedIds.slice(i, i + 100))
  for (const r of rows || []) anyClaim.add(r.listing_id)
}
for (const a of approved || []) if (!anyClaim.has(a.listing_id)) violations.push(['grant_fell_through', `review ${a.id} (${a.claimant_email})`])

const claimantIds = [...new Set((liveClaims || []).map(c => c.claimed_by).filter(Boolean))]
const profs = new Map()
for (let i = 0; i < claimantIds.length; i += 100) {
  const { data: rows } = await sb.from('profiles').select('id, email, role').in('id', claimantIds.slice(i, i + 100))
  for (const p of rows || []) profs.set(p.id, p)
}
for (const c of liveClaims || []) {
  const name = c.listings?.name || c.listing_id
  if (!c.claimed_by) { violations.push(['orphaned_claimant', `${name} (${c.claimant_email}): claimed_by null`]); continue }
  const p = profs.get(c.claimed_by)
  if (!p) violations.push(['orphaned_claimant', `${name} (${c.claimant_email}): no profile ${c.claimed_by}`])
  else if (p.role !== 'vendor' && p.role !== 'admin') violations.push(['role_locked_out', `${name}: ${p.email || c.claimant_email} role='${p.role}'`])
}

console.log(`  live claims: ${(liveClaims || []).length}, approved reviews: ${(approved || []).length}`)
if (violations.length === 0) ok('claim_integrity', '0 violations across checks 1–6')
else {
  for (const [check, detail] of violations) bad(check, detail)
}

report()

function report() {
  const fails = results.filter(r => !r[0])
  console.log(`\n${fails.length === 0 ? 'ALL GREEN' : `${fails.length} FAILURE(S)`} — ${results.length} checks`)
  process.exit(fails.length === 0 ? 0 : 1)
}
