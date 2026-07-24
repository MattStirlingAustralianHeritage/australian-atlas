// Concern 3: prove the new commercial_groups entry auto-rejects a candidate
// operating on an estate domain, via the canonical shared independence check
// (lib/gate-check/character.js — the same logic the prospector applies to
// candidates and gate-check applies to live listings). Then clean up.
//   node scripts/mount-lofty/03-gate-reject-test.mjs
import { loadEnv, masterClient } from './_lib.mjs'
import { checkCharacterGate } from '../../lib/gate-check/character.js'

const env = loadEnv()
const master = masterClient(env)

const { data: groups, error: gErr } = await master.from('commercial_groups').select('*')
if (gErr) throw new Error(`groups load: ${gErr.message}`)

// ── Insert a real test candidate (listing_candidates has website_url + status) ──
const testRow = {
  name: '__TEST__ Mount Lofty Reject Check',
  website_url: 'https://mtloftyhouse.com.au',
  vertical: 'rest',
  status: 'pending',
  source: 'user_suggested',
  source_detail: 'mount-lofty-estate-group-removal gate test',
  notes: 'TEMP gate-reject test row — safe to delete.',
}
const { data: ins, error: iErr } = await master
  .from('listing_candidates').insert(testRow).select('id, name, website_url, vertical, status').single()
if (iErr) throw new Error(`insert test candidate: ${iErr.message}`)
console.log('inserted test candidate:', JSON.stringify(ins))

let cleanupOk = false
try {
  const verdict = checkCharacterGate(
    { name: ins.name, website: ins.website_url, vertical: ins.vertical }, groups,
  )
  console.log('\n=== gate verdict (test candidate) ===')
  console.log(JSON.stringify(verdict, null, 2))
  const rejected = !!verdict && verdict.group === 'Mount Lofty Estate' && /domain/.test(verdict.reason)
  console.log(`AUTO-REJECT by Mount Lofty Estate (domain): ${rejected}`)

  if (rejected) {
    await master.from('listing_candidates')
      .update({ status: 'rejected', notes: `auto-rejected: ${verdict.reason}` }).eq('id', ins.id)
  }

  const control = checkCharacterGate(
    { name: 'Totally Independent Guesthouse', website: 'https://some-independent-guesthouse-xyz.com.au', vertical: 'rest' }, groups,
  )
  console.log(`\nnegative control rejected? ${control ? 'YES (BAD)' : 'no (good)'}`)

  console.log('\n=== per-domain match check ===')
  for (const d of ['mtloftyhouse.com.au','sequoialodge.com.au','gatekeepersdayspa.com.au','hardysverandah.com.au','marthahardys.com.au']) {
    const v = checkCharacterGate({ name: 'x', website: `https://www.${d}`, vertical: 'table' }, groups)
    console.log(`${d}: ${v?.group === 'Mount Lofty Estate' ? 'REJECT' : 'no-match'}`)
  }

  if (!rejected) throw new Error('EXPECTED auto-reject did not fire')
  if (control) throw new Error('negative control was wrongly rejected')
} finally {
  const { error: dErr } = await master.from('listing_candidates').delete().eq('id', ins.id)
  if (dErr) console.error('CLEANUP FAILED — delete test row manually:', ins.id, dErr.message)
  else {
    const { data: gone } = await master.from('listing_candidates').select('id').eq('id', ins.id)
    cleanupOk = !gone || gone.length === 0
    console.log(`\ntest row deleted: ${cleanupOk}`)
  }
}
console.log(cleanupOk ? '\nGATE TEST PASSED + cleaned up' : '\nGATE TEST done — CHECK CLEANUP')
