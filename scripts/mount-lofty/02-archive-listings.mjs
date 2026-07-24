// Concern 2: soft-archive the DOMAIN-matched Mount Lofty Estate listings.
//   node scripts/mount-lofty/02-archive-listings.mjs
//
// The live listings.status CHECK constraint is
//   ('active','inactive','pending','hidden','deleted')  -- NO 'archived'.
// So master rows use status='deleted' (the codebase's reversible soft-delete /
// Trash state — migration 153: rows preserved, restorable, excluded from every
// public surface). The rest source `properties` rows are set to their own
// 'archived' status (a valid source value) which (a) 404s the restatlas vertical
// surface and (b) keeps the master row out of 'active' on the next sync
// (normalizeStatus('archived') -> 'inactive').
//
// Safety:
//   * DOMAIN match only (never name match).
//   * Per-row live-claim guard: any listing with a listing_claims row in
//     ('active','past_due') is SKIPPED and flagged, never archived silently.
//   * No hard deletes. Rows and audit fields preserved.
//   * Full before/after status snapshot + diff for step-9 verification.
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv, masterClient, restClient, pgConnect, DOMAINS, REPO } from './_lib.mjs'

const LIVE_CLAIM_STATUSES = ['active', 'past_due'] // mirror lib/claims/statuses.js
const AUDIT_REASON = 'Mount Lofty Estate group — commercial_groups removal (Accor MGallery; fails point-of-operation independence). See migration 259.'
const OUT = resolve(REPO, 'scripts/mount-lofty/artifacts')
mkdirSync(OUT, { recursive: true })

const env = loadEnv()
const master = masterClient(env)
const rest = restClient(env)
const client = await pgConnect(env)

// ── Full status snapshot BEFORE ──────────────────────────────────────────
const before = await client.query(`SELECT id, status FROM listings;`)
const beforeMap = new Map(before.rows.map(r => [r.id, r.status]))
writeFileSync(resolve(OUT, 'snapshot_before.json'), JSON.stringify([...beforeMap]))
console.log(`snapshot BEFORE: ${beforeMap.size} listings`)

// ── Resolve DOMAIN-matched rows (fresh) ──────────────────────────────────
const matched = []
for (const d of DOMAINS) {
  const { data, error } = await master
    .from('listings')
    .select('id, slug, name, vertical, source_id, website, status')
    .ilike('website', `%${d}%`)
  if (error) throw new Error(`domain query ${d}: ${error.message}`)
  for (const row of (data || [])) matched.push({ matched_domain: d, ...row })
}
const byId = new Map()
for (const m of matched) if (!byId.has(m.id)) byId.set(m.id, m)
const rows = [...byId.values()]
console.log(`DOMAIN-matched listings: ${rows.length}`)

// ── Per-row claim guard + archive ────────────────────────────────────────
const report = { archived: [], skipped_claimed: [], errors: [] }

for (const r of rows) {
  const { data: claims, error: cErr } = await master
    .from('listing_claims')
    .select('id, status, tier, claimant_email, claimed_at')
    .eq('listing_id', r.id)
  if (cErr) throw new Error(`claims read ${r.slug}: ${cErr.message}`)

  const liveClaims = (claims || []).filter(c => LIVE_CLAIM_STATUSES.includes(c.status))
  if (liveClaims.length > 0) {
    // HALT on this row only — do not archive a claimed listing silently.
    report.skipped_claimed.push({ ...r, liveClaims })
    console.log(`SKIP (live claim) ${r.vertical}/${r.slug} — ${liveClaims.map(c => c.status).join(',')}`)
    continue
  }

  // 1) Source de-publish (rest `properties`): prevents sync reactivation and
  //    404s the vertical surface. source_id is the numeric properties.id.
  const srcId = Number(r.source_id)
  let sourceResult = 'n/a'
  if (r.vertical === 'rest' && Number.isFinite(srcId)) {
    const { data: upd, error: sErr } = await rest
      .from('properties').update({ status: 'archived' }).eq('id', srcId).select('id, status')
    if (sErr) throw new Error(`source archive ${r.slug}: ${sErr.message}`)
    sourceResult = upd?.[0]?.status ?? 'not-found'
  }

  // 2) Master soft-delete + audit reason (hidden_reason is not sync-written,
  //    so it survives). status='deleted' excludes it from every public surface.
  const { data: mUpd, error: mErr } = await master
    .from('listings')
    .update({ status: 'deleted', hidden_reason: AUDIT_REASON, updated_at: new Date().toISOString() })
    .eq('id', r.id).select('id, status, hidden_reason')
  if (mErr) throw new Error(`master archive ${r.slug}: ${mErr.message}`)

  report.archived.push({
    ...r, source_status: sourceResult, master_status: mUpd?.[0]?.status, prior_status: beforeMap.get(r.id),
  })
  console.log(`ARCHIVED ${r.vertical}/${r.slug} | master:${beforeMap.get(r.id)}->${mUpd?.[0]?.status} | source:${sourceResult}`)
}

// ── Full status snapshot AFTER + diff ────────────────────────────────────
const after = await client.query(`SELECT id, status FROM listings;`)
const afterMap = new Map(after.rows.map(r => [r.id, r.status]))
writeFileSync(resolve(OUT, 'snapshot_after.json'), JSON.stringify([...afterMap]))

const changed = []
for (const [id, st] of afterMap) if (beforeMap.get(id) !== st) changed.push({ id, from: beforeMap.get(id), to: st })
report.status_changes = changed
report.rows_added = [...afterMap.keys()].filter(id => !beforeMap.has(id))
report.rows_removed = [...beforeMap.keys()].filter(id => !afterMap.has(id))
writeFileSync(resolve(OUT, 'archive_report.json'), JSON.stringify(report, null, 2))

console.log('\n=== status changes (whole table) ===')
console.log(JSON.stringify(changed, null, 2))
console.log(`rows added: ${report.rows_added.length}, rows removed: ${report.rows_removed.length}`)
console.log(`archived: ${report.archived.length}, skipped(claimed): ${report.skipped_claimed.length}`)

const archivedIds = new Set(report.archived.map(a => a.id))
const unexpected = changed.filter(c => !archivedIds.has(c.id))
console.log(`unexpected status changes outside archive set: ${unexpected.length}`)
if (unexpected.length) console.log(JSON.stringify(unexpected, null, 2))

await client.end()
