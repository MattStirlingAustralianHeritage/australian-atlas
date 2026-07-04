#!/usr/bin/env node
/**
 * Backfill Google Places opening hours onto the canonical `listings` table for
 * LIVE sba listings that already have a durable google_place_id in the sba
 * source DB. ONE legacy Place Details call per venue (minimal Contact-tier
 * field mask). Writes ONLY the three additive columns:
 *   opening_hours, opening_hours_status, opening_hours_fetched_at
 * Never fabricates hours. Checkpointed, idempotent, cost-guarded ($50 ceiling),
 * error-rate-guarded (halt > 15%/batch), rate-limited with OVER_QUERY_LIMIT
 * backoff.
 *
 * Only sba currently stores google_place_id; other verticals have no place_id
 * and are intentionally out of scope (backfilling them would require a second
 * billed Text Search call + fuzzy matching — see logs/phase0-discovery.md).
 *
 * Usage: node scripts/backfill-opening-hours.mjs <pilot|full> [--dry] [--force]
 */
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
function loadEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  } catch {}
}
loadEnv()

const MODE = (process.argv[2] || 'pilot').toLowerCase()
const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')

const COST_CEILING_USD = 50
const PER_CALL_CEILING = 0.025 // conservative $25/1k for the ceiling guard
const PER_CALL_NOMINAL = 0.020
const ERROR_RATE_HALT = 0.15
const BATCH = 50
const RATE_MS = 250
const STALE_DAYS = 25
const PILOT_SIZE = 20
const CKPT = path.resolve(__dirname, `../.hours-checkpoint-${MODE}.json`)
const PLACES = 'https://maps.googleapis.com/maps/api/place'
const API_KEY = process.env.GOOGLE_PLACES_API_KEY
const sleep = ms => new Promise(r => setTimeout(r, ms))

const pool = new pg.Pool({
  connectionString: `postgresql://postgres.nyhkcmvhwbydsqsyvizs:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
const sbaDb = createClient(process.env.SBA_SUPABASE_URL, process.env.SBA_SUPABASE_SERVICE_KEY)

async function getDetails(placeId) {
  const params = new URLSearchParams({ place_id: placeId, fields: 'place_id,name,business_status,opening_hours', key: API_KEY })
  let data
  for (let attempt = 0; attempt <= 3; attempt++) {
    const res = await fetch(`${PLACES}/details/json?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
    if (data.status !== 'OVER_QUERY_LIMIT') break
    await sleep(2000 * (attempt + 1))
  }
  if (data.status === 'OVER_QUERY_LIMIT') {
    // Distinguish a hard DAILY quota cap (halt — resume after reset) from a
    // transient per-minute/QPS throttle (retry with backoff).
    throw new Error(/daily/i.test(data.error_message || '') ? 'DAILY_QUOTA' : 'OVER_QUERY_LIMIT')
  }
  if (data.status !== 'OK') throw new Error(`PLACES_${data.status}`)
  return data.result || null
}

function deriveHours(details) {
  const bs = details?.business_status || null
  const oh = details?.opening_hours || null
  const hasRegular = !!(oh && ((Array.isArray(oh.weekday_text) && oh.weekday_text.length) ||
                               (Array.isArray(oh.periods) && oh.periods.length)))
  let status
  if (bs === 'CLOSED_PERMANENTLY' || bs === 'CLOSED_TEMPORARILY') status = 'unavailable'
  else if (hasRegular) status = 'published'
  else status = 'by_appointment'
  return { value: hasRegular ? oh : null, status }
}

async function buildPlaceIdMap() {
  const out = new Map(); let from = 0
  for (;;) {
    const { data, error } = await sbaDb.from('venues').select('id, google_place_id')
      .not('google_place_id', 'is', null).range(from, from + 999)
    if (error) throw new Error('sba venues read: ' + error.message)
    for (const v of data) out.set(String(v.id), v.google_place_id)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

async function getTargets(pidMap) {
  const { rows } = await pool.query(
    `select id, name, source_id, state, sub_type, opening_hours_fetched_at
       from listings
      where status='active' and coalesce(needs_review,false)=false and vertical='sba'
      order by id`)
  const out = []
  for (const r of rows) {
    const p = pidMap.get(String(r.source_id))
    if (p) out.push({ ...r, place_id: p })
  }
  return out
}

function loadCkpt() { try { return JSON.parse(fs.readFileSync(CKPT, 'utf-8')) } catch { return { processed: {}, calls: 0, errors: [] } } }
function saveCkpt(c) { fs.writeFileSync(CKPT, JSON.stringify(c, null, 2)) }

async function main() {
  if (!API_KEY) { console.error('GOOGLE_PLACES_API_KEY missing'); process.exit(1) }
  const nowISO = new Date().toISOString()
  const pidMap = await buildPlaceIdMap()
  let targets = await getTargets(pidMap)
  if (MODE === 'pilot') targets = targets.slice(0, PILOT_SIZE)
  console.log(`MODE=${MODE} DRY=${DRY} targets=${targets.length} placeIds=${pidMap.size}`)

  const ck = loadCkpt()
  let priorCalls = 0
  if (MODE === 'full') { try { priorCalls = (JSON.parse(fs.readFileSync(CKPT.replace('full', 'pilot'), 'utf-8')).calls) || 0 } catch {} }
  const results = { published: 0, by_appointment: 0, unavailable: 0, errored: 0, skipped: 0 }
  let batchErr = 0, batchN = 0

  for (const t of targets) {
    if (ck.processed[t.id] && !FORCE) { results.skipped++; continue }
    if (!FORCE && t.opening_hours_fetched_at && (Date.now() - new Date(t.opening_hours_fetched_at).getTime()) < STALE_DAYS * 864e5) { results.skipped++; continue }
    if ((priorCalls + ck.calls) * PER_CALL_CEILING + PER_CALL_CEILING > COST_CEILING_USD) {
      console.log(`\n⛔ COST CEILING reached (total calls=${priorCalls + ck.calls}). Remainder is the tail.`); break
    }
    try {
      const details = await getDetails(t.place_id)
      ck.calls++
      const d = deriveHours(details)
      if (!DRY) await pool.query(
        `update listings set opening_hours=$1, opening_hours_status=$2, opening_hours_fetched_at=$3 where id=$4`,
        [d.value ? JSON.stringify(d.value) : null, d.status, nowISO, t.id])
      results[d.status]++
      if (!DRY) ck.processed[t.id] = { status: d.status, ts: nowISO }
    } catch (e) {
      if (e.message === 'DAILY_QUOTA') {
        console.log('\n⛔ Google DAILY quota exhausted — halting. Re-run after quota reset (checkpoint resumes).')
        break
      }
      results.errored++; batchErr++
      ck.errors.push({ id: t.id, name: t.name, place_id: t.place_id, error: e.message })
      if (e.message === 'OVER_QUERY_LIMIT') await sleep(30000)
    }
    batchN++
    await sleep(RATE_MS)
    if (batchN >= BATCH) {
      saveCkpt(ck)
      const rate = batchErr / batchN
      console.log(`batch done (calls=${ck.calls}, errRate=${(rate * 100).toFixed(0)}%, ~$${(ck.calls * PER_CALL_NOMINAL).toFixed(2)})`)
      if (rate > ERROR_RATE_HALT) { console.log(`⛔ ERROR RATE ${(rate * 100).toFixed(0)}% — halting.`); break }
      batchErr = 0; batchN = 0
    }
  }
  saveCkpt(ck)
  const totalCalls = priorCalls + ck.calls
  console.log('\nSUMMARY', results, `totalCalls=${totalCalls} ~$${(totalCalls * PER_CALL_NOMINAL).toFixed(2)} (conservative $${(totalCalls * PER_CALL_CEILING).toFixed(2)}) errors=${ck.errors.length}`)
  await pool.end()
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })
