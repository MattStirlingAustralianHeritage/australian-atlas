#!/usr/bin/env node
/**
 * Gate Check sweep — run the prospector quality gates retroactively over every
 * LIVE (status='active') listing and record the failures in listing_gate_check.
 *
 * Gate 2 (Location) + Gate 4 (Vertical Fit) are instant (pure, no network).
 * Gate 1 (Web Presence) live-fetches each listing's website with bounded
 * concurrency; Gate 3 (Activity) reads the text Gate 1 fetched (falls back to
 * the cached `site_text` column when a listing wasn't fetched).
 *
 * FLAGS ONLY: writes exclusively to listing_gate_check. Never mutates listings.
 * Idempotent: one row per listing (UNIQUE listing_id); re-runs upsert in place
 * and skip listings already actioned (passed/hidden/deleted).
 *
 * Run:
 *   node scripts/sweep-gate-check.mjs
 * Env:
 *   GATE_CHECK_LIMIT        cap listings scanned (testing)
 *   GATE_CHECK_CONCURRENCY  parallel website fetches (default 12)
 *   GATE_CHECK_LIVE_FETCH   '0' to skip live fetch, use cached site_text (default '1')
 *   GATE_CHECK_TIMEOUT      per-fetch timeout ms (default 9000)
 *   GATE_CHECK_AUTOCLEAR    '1' to clear pending rows for listings that no longer fail (full sweep only)
 */
import fs from 'fs'
import path from 'path'
import url from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  checkGate1Web, checkGate2Location, checkGate3Activity, checkGate4Vertical,
  checkGate5ServiceBusiness, summariseFailures,
} from '../lib/gate-check/gates.js'
import { checkCharacterGate } from '../lib/gate-check/character.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
function loadEnv() {
  const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnv()

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const LIMIT = process.env.GATE_CHECK_LIMIT ? parseInt(process.env.GATE_CHECK_LIMIT, 10) : null
const CONCURRENCY = parseInt(process.env.GATE_CHECK_CONCURRENCY || '12', 10)
const LIVE_FETCH = process.env.GATE_CHECK_LIVE_FETCH !== '0'
const TIMEOUT = parseInt(process.env.GATE_CHECK_TIMEOUT || '9000', 10)
const AUTOCLEAR = process.env.GATE_CHECK_AUTOCLEAR === '1'
const CURRENT_YEAR = new Date().getFullYear()
const FLUSH_EVERY = 400

const SELECT = 'id,name,slug,vertical,sub_type,description,region,state,status,lat,lng,website,site_text,site_text_status'

async function fetchAllActive() {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('listings').select(SELECT)
      .eq('status', 'active').order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load listings: ${error.message}`)
    out.push(...data)
    if (!data || data.length < PAGE) break
    if (LIMIT && out.length >= LIMIT) break
  }
  return LIMIT ? out.slice(0, LIMIT) : out
}

async function fetchExistingRows() {
  const map = new Map() // listing_id -> { status, aiDetails }
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    // MUST .order() a stable column — without it, paged range() over a table
    // >1000 rows can skip rows, dropping their listing_id from the resolved set
    // and clobbering a prior admin Pass/Hide/Delete decision on the next sweep.
    const { data, error } = await sb.from('listing_gate_check').select('listing_id,status,gate_details').order('listing_id').range(from, from + PAGE - 1)
    if (error) {
      if (error.code === 'PGRST205' || /listing_gate_check/.test(error.message)) {
        throw new Error('Table listing_gate_check does not exist — apply migration 219 first.')
      }
      throw new Error(`Failed to read existing gate-check rows: ${error.message}`)
    }
    for (const r of data) {
      // On-demand AI findings (code *_ai) can't be recomputed by this sweep —
      // carry them across the upsert so a re-sweep doesn't erase an admin's
      // AI vertical-fit verdict on a still-pending row.
      const aiDetails = (r.gate_details || [])
        .filter(d => String(d.code || '').endsWith('_ai'))
        .map(d => ({ gate: d.gate, code: d.code, severity: d.severity, reason: d.reason, ...(d.suggested_vertical ? { suggested_vertical: d.suggested_vertical } : {}) }))
      map.set(r.listing_id, { status: r.status, aiDetails })
    }
    if (!data || data.length < PAGE) break
  }
  return map
}

// Evaluate one listing → row payload | null.
async function evaluate(listing, groups, keptAiDetails = []) {
  const failures = []
  failures.push(...keptAiDetails)
  failures.push(checkGate2Location(listing))
  failures.push(checkGate4Vertical(listing))
  // Character (commercial-group denylist) — computed here too so a deep re-sweep
  // is a SUPERSET of sweep-character-gate.mjs and can't clobber its findings.
  failures.push(checkCharacterGate(listing, groups))

  let text = null, title = null, lastModified = null, http_status = null
  if (LIVE_FETCH && listing.website) {
    const g1 = await checkGate1Web(listing, { timeoutMs: TIMEOUT, retries: 1 })
    if (g1.failure) failures.push(g1.failure)
    text = g1.text
    title = g1.title ?? null
    lastModified = g1.lastModified
    http_status = g1.http_status
  } else if (listing.website) {
    // No live fetch — lean on the cached enrichment signal.
    if (listing.site_text_status === 'failed') {
      failures.push({ gate: 'gate1_web', code: 'domain_dead', severity: 2,
        reason: 'Cached web check failed to fetch this site — the website appears to be gone.' })
    } else if (listing.site_text_status === 'thin') {
      failures.push({ gate: 'gate1_web', code: 'thin_content', severity: 1,
        reason: 'Cached web check found almost no content — likely a placeholder or broken page.' })
    }
    text = listing.site_text || null
  }

  // Gate 3 from whatever text we have (live or cached).
  if (!text && listing.site_text) text = listing.site_text
  failures.push(checkGate3Activity(text, lastModified, CURRENT_YEAR))
  // Gate 5 (character) — service business judged from the site's own title/content.
  failures.push(checkGate5ServiceBusiness(listing, { title, text }))

  const summary = summariseFailures(failures, { website: listing.website || null, http_status })
  if (!summary) return null
  return {
    listing_id: listing.id,
    scanned_at: new Date().toISOString(),
    status: 'pending',
    reviewed_at: null,
    reviewed_by: null,
    ...summary,
  }
}

async function upsertChunk(rows) {
  if (!rows.length) return 0
  let done = 0
  for (let i = 0; i < rows.length; i += 500) {
    const c = rows.slice(i, i + 500)
    const { data, error } = await sb.from('listing_gate_check')
      .upsert(c, { onConflict: 'listing_id' }).select('id')
    if (error) throw new Error(`Upsert failed after ${done}: ${error.message}`)
    done += data.length
  }
  return done
}

async function main() {
  const t0 = Date.now()
  console.log(`[gate-check] loading active listings…`)
  const [listings, existing, groupsRes] = await Promise.all([
    fetchAllActive(), fetchExistingRows(),
    sb.from('commercial_groups').select('group_name, category, brands, brands_json, domains, vertical_scope, verify_case_by_case, parent_entity, notes'),
  ])
  if (groupsRes.error) throw new Error(`commercial_groups read failed: ${groupsRes.error.message}`)
  const groups = groupsRes.data || []
  const resolved = new Set([...existing.entries()].filter(([, v]) => v.status !== 'pending').map(([id]) => id))
  console.log(`[gate-check] ${listings.length} active listings · ${existing.size} existing rows (${resolved.size} already actioned) · ${groups.length} commercial groups · live-fetch=${LIVE_FETCH} · concurrency=${CONCURRENCY}`)

  const buffer = []
  const failingIds = new Set()
  const erroredIds = new Set() // evaluate() threw — unknown state, never auto-clear these
  const stats = { flagged: 0, byGate: {}, byAction: {}, bySeverity: {}, upserted: 0 }
  let processed = 0
  let interrupted = false

  async function maybeFlush(force) {
    if (buffer.length && (force || buffer.length >= FLUSH_EVERY)) {
      const batch = buffer.splice(0)
      // Snapshot the count before mutating shared state (no await between read
      // and write) so overlapping flushes can't lose an increment.
      const n = await upsertChunk(batch)
      stats.upserted += n
    }
  }

  // Bounded worker pool over a shared index.
  let idx = 0
  async function worker() {
    while (idx < listings.length && !interrupted) {
      const listing = listings[idx++]
      let row = null
      const prev = existing.get(listing.id)
      const keptAi = prev && prev.status === 'pending' ? prev.aiDetails : []
      try { row = await evaluate(listing, groups, keptAi) } catch (e) { erroredIds.add(listing.id) /* per-listing failure is non-fatal */ }
      processed++
      if (row) {
        failingIds.add(listing.id)
        if (!resolved.has(listing.id)) {
          buffer.push(row)
          stats.flagged++
          for (const g of row.failed_gates) stats.byGate[g] = (stats.byGate[g] || 0) + 1
          stats.byAction[row.suggested_action] = (stats.byAction[row.suggested_action] || 0) + 1
          stats.bySeverity[row.severity] = (stats.bySeverity[row.severity] || 0) + 1
        }
      }
      if (buffer.length >= FLUSH_EVERY) await maybeFlush(false)
      if (processed % 250 === 0) {
        const rate = (processed / ((Date.now() - t0) / 1000)).toFixed(1)
        console.log(`[gate-check] ${processed}/${listings.length} · flagged ${stats.flagged} · upserted ${stats.upserted} · ${rate}/s`)
      }
    }
  }

  // Flush-on-interrupt safety: stop starting new work, let in-flight settle briefly, flush, exit.
  const onSig = async () => { if (interrupted) return; interrupted = true; console.log('\n[gate-check] interrupt — draining…'); await new Promise(r => setTimeout(r, 300)); await maybeFlush(true); process.exit(1) }
  process.on('SIGINT', onSig)
  process.on('SIGTERM', onSig)

  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker))
  await maybeFlush(true)

  // Optional: clear pending rows for listings that no longer fail (full sweep only).
  let cleared = 0
  const fullSweep = !LIMIT && LIVE_FETCH
  if (AUTOCLEAR && fullSweep) {
    // Never clear a row whose listing errored mid-evaluation — "we couldn't
    // check it" is not "it passed".
    const stalePending = [...existing.entries()].filter(([id, v]) => v.status === 'pending' && !failingIds.has(id) && !erroredIds.has(id)).map(([id]) => id)
    for (let i = 0; i < stalePending.length; i += 200) {
      const c = stalePending.slice(i, i + 200)
      const { data, error } = await sb.from('listing_gate_check')
        .update({ status: 'passed', reviewed_at: new Date().toISOString(), reviewed_by: 'auto_rescan_cleared' })
        .in('listing_id', c).select('id')
      if (error) throw new Error(`Auto-clear failed: ${error.message}`)
      cleared += data.length
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`\n[gate-check] DONE in ${secs}s`)
  console.log(`  scanned:  ${processed}`)
  console.log(`  flagged:  ${stats.flagged} (upserted ${stats.upserted})`)
  console.log(`  by gate:  ${JSON.stringify(stats.byGate)}`)
  console.log(`  by action:${JSON.stringify(stats.byAction)}`)
  console.log(`  severity: ${JSON.stringify(stats.bySeverity)}`)
  if (AUTOCLEAR && fullSweep) console.log(`  auto-cleared (no longer failing): ${cleared}`)
}

main().then(() => process.exit(0)).catch(err => { console.error('[gate-check] FATAL', err); process.exit(1) })
