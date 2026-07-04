#!/usr/bin/env node
/**
 * Step 1 of the opening-hours pipeline: sync operator-entered opening_hours from
 * each vertical source DB into the canonical listings.opening_hours ($0, no
 * scraping). Rank-based provenance: a higher source is never overwritten by a
 * lower one (operator_dashboard > operator_website > google). sba's stored hours
 * are Google-format (Google-origin) so they are labelled 'google' and only FILL
 * GAPS. Other verticals are operator-facing day-keyed records -> 'operator_dashboard'.
 * LIVE listings only. Idempotent. Empty/all-null day-maps are skipped (never fabricated).
 *
 * Usage: node scripts/sync-operator-hours.mjs [--dry]
 */
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
try {
  const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
} catch {}

const DRY = process.argv.includes('--dry')
const pool = new pg.Pool({ connectionString: `postgresql://postgres.nyhkcmvhwbydsqsyvizs:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false } })

const RANK = { '': 0, null: 0, google: 1, operator_website: 2, operator_dashboard: 3 }
const rank = s => RANK[s] || 0
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const ABBR = { monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun' }
function normalize(oh) {
  if (!oh) return null
  if (Array.isArray(oh)) {
    const hasReal = oh.some(s => typeof s === 'string' && (/\d/.test(s) || /closed/i.test(s)))
    return hasReal ? { weekday_text: oh.map(String) } : null
  }
  if (typeof oh === 'object') {
    const anyReal = DAYS.some(d => { const v = oh[d] ?? oh[ABBR[d]]; return v != null && String(v).trim() !== '' })
    if (!anyReal) return null
    const wt = DAYS.map(d => { const v = oh[d] ?? oh[ABBR[d]]; const label = d[0].toUpperCase() + d.slice(1); return (v == null || String(v).trim() === '') ? `${label}: Closed` : `${label}: ${String(v).trim()}` })
    return { weekday_text: wt }
  }
  return null
}
const VC = [
  { vk: 'sba', u: 'SBA_SUPABASE_URL', k: 'SBA_SUPABASE_SERVICE_KEY', tables: ['venues'], label: 'google' },
  { vk: 'craft', u: 'CRAFT_SUPABASE_URL', k: 'CRAFT_SUPABASE_SERVICE_KEY', tables: ['venues'], label: 'operator_dashboard' },
  { vk: 'fine_grounds', u: 'FINE_GROUNDS_SUPABASE_URL', k: 'FINE_GROUNDS_SUPABASE_SERVICE_KEY', tables: ['roasters', 'cafes'], label: 'operator_dashboard' },
  { vk: 'rest', u: 'REST_SUPABASE_URL', k: 'REST_SUPABASE_SERVICE_KEY', tables: ['properties'], label: 'operator_dashboard' },
  { vk: 'corner', u: 'CORNER_SUPABASE_URL', k: 'CORNER_SUPABASE_SERVICE_KEY', tables: ['shops'], label: 'operator_dashboard' },
  { vk: 'found', u: 'FOUND_SUPABASE_URL', k: 'FOUND_SUPABASE_SERVICE_KEY', tables: ['shops'], label: 'operator_dashboard' },
  { vk: 'table', u: 'TABLE_SUPABASE_URL', k: 'TABLE_SUPABASE_SERVICE_KEY', tables: ['listings'], label: 'operator_dashboard' },
]
async function pageAll(sb, t) {
  let out = [], from = 0
  for (;;) { const { data, error } = await sb.from(t).select('id, opening_hours').not('opening_hours', 'is', null).range(from, from + 999)
    if (error) { console.log(`  ${t} read err: ${error.message}`); break }
    out = out.concat(data || []); if (!data || data.length < 1000) break; from += 1000 }
  return out
}
async function main() {
  const { rows } = await pool.query(`select id, vertical, source_id, opening_hours_source from listings where status='active' and coalesce(needs_review,false)=false`)
  const map = new Map(); for (const r of rows) map.set(`${r.vertical}:${r.source_id}`, { id: r.id, src: r.opening_hours_source })
  console.log(`live listings indexed: ${map.size}`)
  const totals = { written: 0, skip_no_hours: 0, skip_lower_or_equal: 0, unmatched: 0 }
  const nowISO = new Date().toISOString()
  for (const c of VC) {
    const sb = createClient(process.env[c.u], process.env[c.k]); let w = 0, snh = 0, sle = 0, un = 0
    for (const t of c.tables) {
      let src = []; try { src = await pageAll(sb, t) } catch (e) { console.log(`  ${c.vk}.${t} threw ${e.message}`); continue }
      for (const row of src) {
        const norm = normalize(row.opening_hours); if (!norm) { snh++; continue }
        const hit = map.get(`${c.vk}:${row.id}`); if (!hit) { un++; continue }
        if (rank(c.label) <= rank(hit.src)) { sle++; continue }
        if (!DRY) { await pool.query(`update listings set opening_hours=$1, opening_hours_status='published', opening_hours_source=$2, opening_hours_fetched_at=$3 where id=$4`, [JSON.stringify(norm), c.label, nowISO, hit.id]); hit.src = c.label }
        w++
      }
    }
    totals.written += w; totals.skip_no_hours += snh; totals.skip_lower_or_equal += sle; totals.unmatched += un
    console.log(`${c.vk} (${c.label}): written=${w} skip_no_hours=${snh} skip_lower_or_equal=${sle} unmatched=${un}`)
  }
  console.log('\nTOTALS', totals, DRY ? '(DRY)' : '')
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
