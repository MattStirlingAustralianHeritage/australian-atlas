/**
 * Repair: listings.is_claimed=true with no live listing_claims row.
 *
 * Two SBA venues sat in this state indefinitely. The flag makes
 * POST /api/claim answer 409 "already been claimed" to the genuine operator,
 * while the absent claim row means no account has a dashboard — the venue is
 * locked in a state where nobody owns it and nobody can ask to.
 *
 * Evidence gathered before writing anything:
 *   1813 (sba venue 2782)  — the only row in SBA's own `claims` table is
 *     Matt's, status 'rejected'. The vertical set is_claimed on submission and
 *     never cleared it when the claim was refused.
 *   Bindi Wine Growers (sba venue 302) — no claims row has ever existed, and
 *     the venue's created_at == updated_at, so nothing has touched it since
 *     import. The flag was seeded, not earned.
 *
 * SOURCE FIRST. Master's is_claimed for an unclaimed listing is derived from
 * the vertical row on every sync (syncVertical's claim guard only forces
 * is_claimed=true for listings that DO hold a live claim), so writing master
 * alone would be reverted on the next run.
 *
 * Run with --apply to write; default is a dry run.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const APPLY = process.argv.includes('--apply')

const env = {}
for (const line of fs.readFileSync('/Users/matt/Desktop/Australian Atlas Websites/australian-atlas/.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const master = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sba = createClient(env.SBA_SUPABASE_URL, env.SBA_SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const TARGETS = [
  { listingId: 'f85d464f-ac07-48bb-b76e-19ade3972abb', sourceId: 2782, name: '1813' },
  { listingId: 'fc990710-a4af-43a5-9595-08f2010f1f1e', sourceId: 302, name: 'Bindi Wine Growers' },
]

console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===')

for (const t of TARGETS) {
  // Re-verify the precondition at write time. If an operator legitimately
  // claimed this venue between the audit and now, leave it alone.
  const { data: live } = await master
    .from('listing_claims')
    .select('id, claimant_email, status')
    .eq('listing_id', t.listingId)
    .in('status', ['active', 'past_due'])
  if (live?.length) {
    console.log(`SKIP ${t.name}: a live claim now exists (${live[0].claimant_email}) — nothing to repair`)
    continue
  }

  const { data: before } = await master.from('listings').select('is_claimed').eq('id', t.listingId).single()
  const { data: srcBefore } = await sba.from('venues').select('is_claimed').eq('id', t.sourceId).single()
  console.log(`\n${t.name}: master.is_claimed=${before?.is_claimed}  sba.venues[${t.sourceId}].is_claimed=${srcBefore?.is_claimed}`)

  if (!APPLY) { console.log('  would set both to false'); continue }

  // 1. SOURCE first — otherwise the next sync writes true straight back.
  const { error: srcErr } = await sba.from('venues').update({ is_claimed: false }).eq('id', t.sourceId)
  if (srcErr) { console.log(`  SOURCE WRITE FAILED: ${srcErr.message} — leaving master alone`); continue }

  // 2. Master.
  const { error: mErr } = await master.from('listings').update({ is_claimed: false }).eq('id', t.listingId)
  if (mErr) { console.log(`  MASTER WRITE FAILED: ${mErr.message}`); continue }

  const { data: after } = await master.from('listings').select('is_claimed').eq('id', t.listingId).single()
  const { data: srcAfter } = await sba.from('venues').select('is_claimed').eq('id', t.sourceId).single()
  console.log(`  -> master.is_claimed=${after?.is_claimed}  sba.is_claimed=${srcAfter?.is_claimed}`)
}

// Final network-wide re-audit, paginated (PostgREST caps a page at 1000).
async function pageAll(client, table, select, tweak = q => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tweak(client.from(table).select(select)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}
const claimed = await pageAll(master, 'listings', 'id, name, vertical', q => q.eq('is_claimed', true))
const liveAll = await pageAll(master, 'listing_claims', 'listing_id', q => q.in('status', ['active', 'past_due']))
const liveIds = new Set(liveAll.map(c => c.listing_id))
const strays = claimed.filter(l => !liveIds.has(l.id))
const claimedIds = new Set(claimed.map(l => l.id))
const reverse = liveAll.filter(c => !claimedIds.has(c.listing_id))
console.log(`\n=== POST-REPAIR AUDIT ===`)
console.log(`is_claimed=true with no live claim: ${strays.length} ${strays.map(s => s.name).join(', ')}`)
console.log(`live claim with is_claimed=false:   ${reverse.length}`)
