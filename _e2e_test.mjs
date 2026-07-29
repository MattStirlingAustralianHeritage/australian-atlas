/**
 * End-to-end test of the claim verification gate — driven entirely through the
 * real HTTP routes, so what is proven is the shipped behaviour and not a
 * re-implementation of it.
 *
 * The property under test: between admin approval and the operator proving
 * their address, the listing is NOT owned.
 *
 * Fixtures are created here and deleted at the end. The test listing carries
 * needs_review=true and hidden_reason='test_fixture', so it is off every public
 * surface for the seconds it exists. Pass --keep to leave it for inspection.
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
const BASE = process.env.BASE_URL || 'http://localhost:3200'
const KEEP = process.argv.includes('--keep')
const STAMP = (process.argv.find(a => !a.startsWith('--') && /^[a-z0-9]+$/.test(a) && a !== 'node') || 'x1')

const TEST_EMAIL = `verification-gate-test-${STAMP}@example.invalid`
const TEST_SLUG = `zz-verification-gate-test-${STAMP}`

let pass = 0, fail = 0
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
}

// Admin session cookie, minted the same way /api/admin-auth does.
const adminSecret = new TextEncoder().encode(env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD)
const adminJwt = await new SignJWT({ role: 'admin' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(adminSecret)
const adminCookie = `atlas_admin=${adminJwt}`

const { data: listing, error: lErr } = await sb.from('listings').insert({
  name: 'ZZ Verification Gate Test',
  slug: TEST_SLUG, vertical: 'sba', sub_type: 'winery',
  status: 'active', is_claimed: false,
  needs_review: true, hidden_reason: 'test_fixture',
  source_id: `test-${STAMP}`, state: 'VIC',
}).select('id, slug').single()
if (lErr) { console.error('could not create test listing:', lErr.message); process.exit(1) }
console.log(`listing ${listing.id}  (${listing.slug})\nemail   ${TEST_EMAIL}\nbase    ${BASE}\n`)

let userId = null
async function cleanup() {
  if (KEEP) { console.log('\n--keep: fixtures left in place'); return }
  await sb.from('listing_claims').delete().eq('listing_id', listing.id)
  await sb.from('claims_review').delete().eq('listing_id', listing.id)
  await sb.from('listing_activity').delete().eq('listing_id', listing.id)
  await sb.from('listings').delete().eq('id', listing.id)
  if (userId) { await sb.from('profiles').delete().eq('id', userId); await sb.auth.admin.deleteUser(userId) }
  console.log('\nfixtures cleaned up')
}

try {
  // ── 1. Unauthenticated submission ───────────────────────
  console.log('1. POST /api/claim with no session')
  const res1 = await fetch(`${BASE}/api/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId: listing.id, slug: TEST_SLUG, name: 'Test Operator', email: TEST_EMAIL, role: 'owner', tier: 'free' }),
  })
  const body1 = await res1.json().catch(() => ({}))
  check('refused with 401', res1.status === 401, `got ${res1.status}`)
  check("code 'auth_required' drives the sign-up step", body1.code === 'auth_required', JSON.stringify(body1))
  const { count: leaked } = await sb.from('claims_review').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id)
  check('nothing was written', leaked === 0, `found ${leaked} rows`)

  // ── 2. An account exists, but has never verified ────────
  console.log('\n2. Claim from a real but UNVERIFIED account')
  const { data: created, error: cErr } = await sb.auth.admin.createUser({ email: TEST_EMAIL, email_confirm: false })
  if (cErr) throw new Error(`createUser: ${cErr.message}`)
  userId = created.user.id
  check('account starts unverified', !created.user.email_confirmed_at)

  const { data: review, error: rErr } = await sb.from('claims_review').insert({
    listing_id: listing.id, vertical: 'sba',
    claimant_name: 'Test Operator', claimant_email: TEST_EMAIL,
    claimed_by: userId, tier: 'free', status: 'pending',
    admin_notes: 'E2E verification-gate test.',
  }).select('id').single()
  if (rErr) throw new Error(`claims_review insert: ${rErr.message}`)
  check('claims_review stores claimed_by (migration 265)', !!review.id)

  // ── 3. Admin approves, through the real route ───────────
  console.log('\n3. POST /api/admin/claims  action=approve')
  const res3 = await fetch(`${BASE}/api/admin/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ claimId: review.id, action: 'approve', usingPortalTable: true, vertical: 'sba' }),
  })
  const body3 = await res3.json().catch(() => ({}))
  check('approve returned 200', res3.status === 200, `${res3.status} ${JSON.stringify(body3)}`)

  const [{ data: afterApprove }, { count: ownRows }, { data: prof }, { data: rev }] = await Promise.all([
    sb.from('listings').select('is_claimed').eq('id', listing.id).single(),
    sb.from('listing_claims').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id),
    sb.from('profiles').select('role').eq('id', userId).maybeSingle(),
    sb.from('claims_review').select('status, verified_at, admin_notes').eq('id', review.id).single(),
  ])
  check('listing is STILL UNCLAIMED', afterApprove.is_claimed === false, `is_claimed=${afterApprove.is_claimed}`)
  check('NO ownership row was created', ownRows === 0, `found ${ownRows}`)
  check('profile NOT promoted to vendor', (prof?.role || 'user') !== 'vendor', `role=${prof?.role}`)
  check("claims_review = 'pending_verification'", rev.status === 'pending_verification', rev.status)
  check('verified_at still null', rev.verified_at === null)
  check('intake provenance preserved', /E2E verification-gate test/.test(rev.admin_notes || ''), rev.admin_notes)

  // The share kit says "your listing is live" and links to the dashboard. At
  // this point the claimant owns nothing and that dashboard would 403 them, so
  // it must not have gone out alongside the "one step left" approval email.
  const { data: kitAtApproval } = await sb.from('listings').select('share_kit_sent_at').eq('id', listing.id).single()
  check('NO share kit sent while the claim is unverified', kitAtApproval.share_kit_sent_at === null, String(kitAtApproval.share_kit_sent_at))

  // ── 4. The listing is still claimable by someone else ───
  console.log('\n4. The listing has not been taken out of circulation')
  const { data: claimable } = await sb.from('listings').select('is_claimed, status').eq('id', listing.id).single()
  check('is_claimed=false, so /api/claim will not 409 a rival claimant', claimable.is_claimed === false)

  // ── 5. Proof: the operator opens their link ─────────────
  console.log('\n5. GET /auth/callback with a real magic-link token')
  const { data: link, error: gErr } = await sb.auth.admin.generateLink({
    type: 'magiclink', email: TEST_EMAIL,
    options: { redirectTo: `${BASE}/auth/callback?next=/dashboard` },
  })
  if (gErr) throw new Error(`generateLink: ${gErr.message}`)
  const cbUrl = `${BASE}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=/dashboard`
  const res5 = await fetch(cbUrl, { redirect: 'manual' })
  const loc = res5.headers.get('location') || ''
  check('callback redirected (session minted)', [302, 307].includes(res5.status), `status ${res5.status}`)
  check('landed on /dashboard, not the error page', loc.includes('/dashboard'), loc)

  const [{ data: afterVerify }, { data: owned }, { data: prof2 }, { data: rev2 }] = await Promise.all([
    sb.from('listings').select('is_claimed').eq('id', listing.id).single(),
    sb.from('listing_claims').select('id, status, claimed_by, tier').eq('listing_id', listing.id),
    sb.from('profiles').select('role, vendor_verticals').eq('id', userId).maybeSingle(),
    sb.from('claims_review').select('status, verified_at').eq('id', review.id).single(),
  ])
  check('listing is NOW claimed', afterVerify.is_claimed === true)
  check('exactly one ACTIVE ownership row', owned?.length === 1 && owned[0].status === 'active', JSON.stringify(owned))
  check('owned by the verified account', owned?.[0]?.claimed_by === userId)
  check('tier free — verification never grants paid', owned?.[0]?.tier === 'free')
  check('profile promoted to vendor', prof2?.role === 'vendor', `role=${prof2?.role}`)
  check('vertical recorded', !!prof2?.vendor_verticals?.sba)
  check("claims_review = 'approved'", rev2.status === 'approved', rev2.status)
  check('verified_at stamped', !!rev2.verified_at)

  // ── 6. Idempotency ──────────────────────────────────────
  console.log('\n6. Second sign-in (refresh / cron backstop)')
  const { data: link2 } = await sb.auth.admin.generateLink({
    type: 'magiclink', email: TEST_EMAIL, options: { redirectTo: `${BASE}/auth/callback?next=/dashboard` },
  })
  await fetch(`${BASE}/auth/callback?token_hash=${encodeURIComponent(link2.properties.hashed_token)}&type=magiclink&next=/dashboard`, { redirect: 'manual' })
  const { count: rowsAfter } = await sb.from('listing_claims').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id)
  check('still exactly one ownership row', rowsAfter === 1, `found ${rowsAfter}`)

  // ── 7. Audit trail ──────────────────────────────────────
  console.log('\n7. listing_activity')
  const { data: acts } = await sb.from('listing_activity').select('action, details').eq('listing_id', listing.id).order('created_at')
  const actions = (acts || []).map(a => a.action)
  check('approval logged as awaiting verification', actions.includes('claim_awaiting_verification'), actions.join(','))
  check('proof logged as listing_claimed', actions.includes('listing_claimed'), actions.join(','))
  const claimedAct = (acts || []).find(a => a.action === 'listing_claimed')
  check("proof recorded as 'email_verified'", claimedAct?.details?.proof === 'email_verified', JSON.stringify(claimedAct?.details))
} catch (err) {
  fail++
  console.error('\nTEST THREW:', err.message)
} finally {
  await cleanup()
}

console.log(`\n${'='.repeat(48)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(48)}`)
process.exit(fail ? 1 : 0)
