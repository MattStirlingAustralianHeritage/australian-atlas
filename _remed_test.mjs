/**
 * Tests the claim remediation console through its real HTTP route.
 *
 * Plants one synthetic pre-265 claim — listing marked owned by an address that
 * has never verified — and exercises the console against it. No real operator
 * is touched, and no successful Resend delivery is attempted: the send path is
 * driven with RESEND_API_KEY blank so the FAILURE branch runs, which is the one
 * that matters here (a failed send must leave the operator retryable, not
 * silently recorded as contacted).
 */
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('/Users/matt/Desktop/Australian Atlas Websites/australian-atlas/.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = process.env.BASE_URL || 'http://localhost:3400'

let pass = 0, fail = 0
const check = (l, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${l}`) } else { fail++; console.log(`  FAIL  ${l}${d ? ` — ${d}` : ''}`) } }

const adminSecret = new TextEncoder().encode(env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD)
const adminJwt = await new SignJWT({ role: 'admin' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(adminSecret)
const H = { 'Content-Type': 'application/json', Cookie: `atlas_admin=${adminJwt}` }

const S = 'remed1'
const EMAIL_FREE = `remed-free-${S}@example.invalid`
const EMAIL_VERIFIED = `remed-verified-${S}@example.invalid`
const made = { listings: [], users: [], claims: [] }

async function plant(suffix, email, confirm, tier) {
  const { data: l, error: le } = await sb.from('listings').insert({
    name: `ZZ Remed Test ${suffix}`, slug: `zz-remed-${S}-${suffix}`,
    vertical: 'sba', sub_type: 'winery', status: 'active', is_claimed: true,
    needs_review: true, hidden_reason: 'test_fixture',
    source_id: `remed-${S}-${suffix}`, state: 'VIC',
  }).select('id, name').single()
  if (le) throw new Error(`listing: ${le.message}`)
  made.listings.push(l.id)

  const { data: u, error: ue } = await sb.auth.admin.createUser({ email, email_confirm: confirm })
  if (ue) throw new Error(`user: ${ue.message}`)
  made.users.push(u.user.id)

  const { data: c, error: ce } = await sb.from('listing_claims').insert({
    listing_id: l.id, vertical: 'sba', claimed_by: u.user.id, claimant_email: email,
    tier, status: 'active', claimed_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  }).select('id').single()
  if (ce) throw new Error(`claim: ${ce.message}`)
  made.claims.push(c.id)
  return { listing: l, user: u.user, claimId: c.id }
}

async function cleanup() {
  for (const id of made.claims) await sb.from('listing_claims').delete().eq('id', id)
  for (const id of made.listings) {
    await sb.from('listing_activity').delete().eq('listing_id', id)
    await sb.from('listings').delete().eq('id', id)
  }
  for (const id of made.users) { await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id) }
  console.log('\nfixtures cleaned up')
}

try {
  console.log('Planting fixtures…')
  const free = await plant('free', EMAIL_FREE, false, 'free')          // unverified, free
  const verified = await plant('verified', EMAIL_VERIFIED, true, 'free') // verified — must be excluded
  console.log(`  unverified claim ${free.claimId}\n  verified claim   ${verified.claimId}\n`)

  // ── 1. Auth ──
  console.log('1. Auth')
  const anon = await fetch(`${BASE}/api/admin/claim-remediation`)
  check('unauthenticated GET refused', anon.status === 401, `got ${anon.status}`)

  // ── 2. Cohort ──
  console.log('\n2. Cohort')
  const r2 = await fetch(`${BASE}/api/admin/claim-remediation`, { headers: H })
  const d2 = await r2.json()
  check('GET returns 200', r2.status === 200, JSON.stringify(d2).slice(0, 120))
  const emails = (d2.rows || []).map(r => r.email)
  check('unverified claimant IS in the cohort', emails.includes(EMAIL_FREE))
  check('verified claimant is NOT in the cohort', !emails.includes(EMAIL_VERIFIED))
  const mine = (d2.rows || []).find(r => r.email === EMAIL_FREE)
  check('row carries the listing name', mine?.listing === 'ZZ Remed Test free', mine?.listing)
  check('row starts un-remediated', mine?.remediatedAt === null)
  check('free tier is bulk-eligible', mine?.manualOnly === false)
  check('counts reported', typeof d2.counts?.total === 'number', JSON.stringify(d2.counts))

  // ── 3. Preview leaks no credential ──
  console.log('\n3. Preview')
  const r3 = await fetch(`${BASE}/api/admin/claim-remediation`, {
    method: 'POST', headers: H, body: JSON.stringify({ action: 'preview', claimId: free.claimId }),
  })
  const d3 = await r3.json()
  check('preview returns 200', r3.status === 200)
  check('subject names the listing', /ZZ Remed Test free/.test(d3.subject || ''), d3.subject)
  check('body offers the way back IN', /never managed to sign in/i.test(d3.html || ''))
  check('body offers the way OUT', /isn&rsquo;t yours|isn.t yours/i.test(d3.html || ''))
  check('body does NOT claim they had no way to sign in', !/had no way to sign in/i.test(d3.html || ''))
  check('NO real token was minted into the preview', !/token_hash=/.test(d3.html || ''))
  const { data: afterPreview } = await sb.from('listing_claims').select('remediation_sent_at').eq('id', free.claimId).single()
  check('preview stamped nothing', afterPreview.remediation_sent_at === null)

  // ── 4. Bulk refuses comped Standard ──
  console.log('\n4. Bulk guard for comped Standard')
  const comped = await plant('comped', `remed-comped-${S}@example.invalid`, false, 'standard')
  const r4 = await fetch(`${BASE}/api/admin/claim-remediation`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ action: 'send_bulk', claimIds: [free.claimId, comped.claimId] }),
  })
  const d4 = await r4.json()
  check('bulk refused', r4.status === 400, `got ${r4.status}`)
  check('refusal names the reason', /individually/i.test(d4.error || ''), d4.error)
  const { data: untouched } = await sb.from('listing_claims').select('remediation_sent_at').eq('id', free.claimId).single()
  check('a refused bulk sent nothing at all', untouched.remediation_sent_at === null)

  // ── 5. Failed send rolls the stamp back ──
  console.log('\n5. Failed send must stay retryable (RESEND blank in this env)')
  const r5 = await fetch(`${BASE}/api/admin/claim-remediation`, {
    method: 'POST', headers: H, body: JSON.stringify({ action: 'send', claimId: free.claimId }),
  })
  const d5 = await r5.json()
  const res5 = d5.results?.[0]
  check('send reported an error rather than success', res5?.status === 'error', JSON.stringify(res5))
  check('error explains RESEND is unconfigured', /RESEND_API_KEY/.test(res5?.error || ''), res5?.error)
  const { data: rolled } = await sb.from('listing_claims').select('remediation_sent_at').eq('id', free.claimId).single()
  check('stamp ROLLED BACK — operator still retryable', rolled.remediation_sent_at === null, String(rolled.remediation_sent_at))

  // ── 6. Unknown claim ──
  console.log('\n6. Unknown target')
  const r6 = await fetch(`${BASE}/api/admin/claim-remediation`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ action: 'send', claimId: '00000000-0000-0000-0000-000000000000' }),
  })
  check('rejects a claim outside the cohort', r6.status === 404, `got ${r6.status}`)
} catch (err) {
  fail++
  console.error('\nTEST THREW:', err.message)
} finally {
  await cleanup()
}

console.log(`\n${'='.repeat(48)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(48)}`)
process.exit(fail ? 1 : 0)
