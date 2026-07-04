#!/usr/bin/env node
/**
 * Character / Independence gate sweep.
 *
 * Applies checkCharacterGate() (commercial_groups matching) to every active
 * listing and records failures as gate5_character in listing_gate_check —
 * MERGING with any existing web/location/activity/fit findings on that listing.
 *
 * FLAGS ONLY. Idempotent: skips already-actioned rows; upsert on UNIQUE
 * listing_id. Pure compute (no network) — safe to re-run.
 *
 * Run: node scripts/sweep-character-gate.mjs
 */
import fs from 'fs'
import path from 'path'
import url from 'url'
import { createClient } from '@supabase/supabase-js'
import { checkCharacterGate } from '../lib/gate-check/character.js'
import { summariseFailures } from '../lib/gate-check/gates.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[m[1]] = v }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function pageAll(table, select, filterFn) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(select).order('id').range(from, from + PAGE - 1)
    if (filterFn) q = filterFn(q)
    const { data, error } = await q
    if (error) throw new Error(`${table} read failed: ${error.message}`)
    out.push(...data)
    if (!data || data.length < PAGE) break
  }
  return out
}

async function main() {
  const t0 = Date.now()
  const { data: groups, error: gerr } = await sb.from('commercial_groups')
    .select('group_name, category, brands, brands_json, domains, vertical_scope, verify_case_by_case, parent_entity, notes')
  if (gerr) throw new Error(`commercial_groups read failed: ${gerr.message}`)
  console.log(`[character] ${groups.length} commercial groups loaded`)

  const listings = await pageAll('listings', 'id,name,website,vertical', q => q.eq('status', 'active'))
  console.log(`[character] ${listings.length} active listings`)

  // Existing gate-check rows (stable order for paging).
  const existing = new Map()
  {
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('listing_gate_check')
        .select('id,listing_id,status,failed_gates,gate_details,website,http_status').order('listing_id').range(from, from + PAGE - 1)
      if (error) { if (error.code === 'PGRST205') throw new Error('listing_gate_check missing — apply migration 219'); throw new Error(error.message) }
      for (const r of data) existing.set(r.listing_id, r)
      if (!data || data.length < PAGE) break
    }
  }

  const toUpsert = []
  const stats = { matched: 0, confident: 0, verify: 0, skippedActioned: 0, byGroup: {} }

  for (const l of listings) {
    const fail = checkCharacterGate(l, groups)
    if (!fail) continue
    stats.matched++
    fail.verify ? stats.verify++ : stats.confident++
    stats.byGroup[fail.group] = (stats.byGroup[fail.group] || 0) + 1

    const prev = existing.get(l.id)
    if (prev && prev.status !== 'pending') { stats.skippedActioned++; continue }

    const detail = { gate: fail.gate, code: fail.code, severity: fail.severity, reason: fail.reason }
    // Merge: keep every existing finding except a prior character one; add this.
    const kept = (prev?.gate_details || [])
      .filter(d => d.gate !== 'gate5_character')
      .map(d => ({ gate: d.gate, code: d.code, severity: d.severity, reason: d.reason }))
    const summary = summariseFailures([...kept, detail], { website: prev?.website || l.website || null, http_status: prev?.http_status ?? null })
    toUpsert.push({ listing_id: l.id, scanned_at: new Date().toISOString(), status: 'pending', reviewed_at: null, reviewed_by: null, ...summary })
  }

  let upserted = 0
  for (let i = 0; i < toUpsert.length; i += 500) {
    const c = toUpsert.slice(i, i + 500)
    const { data, error } = await sb.from('listing_gate_check').upsert(c, { onConflict: 'listing_id' }).select('id')
    if (error) throw new Error(`upsert failed after ${upserted}: ${error.message}`)
    upserted += data.length
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`\n[character] DONE in ${secs}s`)
  console.log(`  matched:   ${stats.matched} (${stats.confident} confident / ${stats.verify} verify)`)
  console.log(`  upserted:  ${upserted} (skipped already-actioned: ${stats.skippedActioned})`)
  console.log(`  by group:  ${JSON.stringify(stats.byGroup, null, 0)}`)
}
main().then(() => process.exit(0)).catch(e => { console.error('[character] FATAL', e); process.exit(1) })
