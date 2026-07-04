#!/usr/bin/env node
/**
 * Step 2 of the opening-hours pipeline: source opening hours from operators' own
 * websites, STRUCTURED markup ONLY (schema.org JSON-LD openingHoursSpecification /
 * openingHours). No prose guessing — a site without machine-readable hours is
 * skipped, never fabricated. Writes listings.opening_hours with
 * source='operator_website' (rank 2: overwrites google, never operator_dashboard).
 * LIVE gap listings only. Atlas-network domains excluded. Checkpointed, polite,
 * bounded concurrency.
 *
 * Usage: node scripts/backfill-website-hours.mjs [--dry]
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
try {
  const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
  for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[m[1]] = v }
} catch {}

const DRY = process.argv.includes('--dry')
const CONC = 8, TIMEOUT_MS = 9000
const CKPT = path.resolve(__dirname, '../.website-hours-ckpt.json')
const RANK = { '': 0, null: 0, google: 1, operator_website: 2, operator_dashboard: 3 }; const rank = s => RANK[s] || 0
const pool = new pg.Pool({ connectionString: `postgresql://postgres.nyhkcmvhwbydsqsyvizs:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false } })
const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ABBR = { mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday' }
function fmt(t) { if (t == null) return null; const s = String(t).trim(); const m = s.match(/^(\d{1,2}):(\d{2})/); if (!m) return null
  let h = +m[1]; const mm = m[2]; if (h === 24) return '12:00 AM'; const ap = h < 12 ? 'AM' : 'PM'; let h12 = h % 12; if (h12 === 0) h12 = 12; return `${h12}:${mm} ${ap}` }
function dayName(d) { if (!d) return null; const s = String(d).toLowerCase(); for (const f of FULL) if (s.includes(f.toLowerCase())) return f; return null }
function daysToWeekdayText(days) { const has = FULL.some(f => days[f] && days[f].length); if (!has) return null
  return { weekday_text: FULL.map(f => `${f}: ${(days[f] && days[f].length) ? days[f].join(', ') : 'Closed'}`) } }
function fromSpec(spec) { const days = {}; const arr = Array.isArray(spec) ? spec : [spec]
  for (const s of arr) { if (!s || typeof s !== 'object') continue; let dows = s.dayOfWeek; if (!dows) continue; dows = Array.isArray(dows) ? dows : [dows]
    const o = fmt(s.opens), c = fmt(s.closes); if (o == null || c == null) continue
    for (const dw of dows) { const dn = dayName(dw); if (!dn) continue; (days[dn] = days[dn] || []).push(o === c ? '24 hours' : `${o} – ${c}`) } }
  return daysToWeekdayText(days) }
function fromString(str) { const strs = Array.isArray(str) ? str : [str]; const days = {}
  for (const raw of strs) { if (typeof raw !== 'string') continue
    for (const tok of raw.split(/[,;]+/)) { const m = tok.trim().match(/^([A-Za-z]{2})(?:\s*-\s*([A-Za-z]{2}))?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/); if (!m) continue
      const order = FULL; const a = ABBR[m[1].toLowerCase()], b = m[2] ? ABBR[m[2].toLowerCase()] : a; if (!a || !b) continue
      const ia = order.indexOf(a), ib = order.indexOf(b); if (ia < 0 || ib < 0) continue
      const range = []; for (let i = ia; ; i = (i + 1) % 7) { range.push(order[i]); if (i === ib) break; if (range.length > 7) break }
      const o = fmt(m[3]), c = fmt(m[4]); if (o == null || c == null) continue
      for (const dn of range) (days[dn] = days[dn] || []).push(`${o} – ${c}`) } }
  return daysToWeekdayText(days) }
function extractJsonLd(html) { const out = []; const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m
  while ((m = re.exec(html))) { try { const j = JSON.parse(m[1].trim()); const stack = Array.isArray(j) ? [...j] : [j]
    while (stack.length) { const n = stack.pop(); if (!n || typeof n !== 'object') continue; if (Array.isArray(n['@graph'])) stack.push(...n['@graph']); out.push(n) } } catch {} }
  return out }
function findHours(objs) { for (const o of objs) { if (o && o.openingHoursSpecification) { const r = fromSpec(o.openingHoursSpecification); if (r) return r } }
  for (const o of objs) { if (o && o.openingHours) { const r = fromString(o.openingHours); if (r) return r } } return null }
async function fetchHtml(u) { const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try { const res = await fetch(u, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'AustralianAtlasBot/1.0 (+hours; contact listings@australianatlas.com.au)' } })
    clearTimeout(to); if (!res.ok) return null; const ct = res.headers.get('content-type') || ''; if (!/html/i.test(ct)) return null
    return (await res.text()).slice(0, 600000) } catch { clearTimeout(to); return null } }
const loadCkpt = () => { try { return JSON.parse(fs.readFileSync(CKPT, 'utf-8')) } catch { return { done: {} } } }
const saveCkpt = c => fs.writeFileSync(CKPT, JSON.stringify(c))

async function main() {
  const { rows } = await pool.query(`select id, name, website, opening_hours_source from listings
    where status='active' and coalesce(needs_review,false)=false and website is not null order by id`)
  const ATLAS = /(australianatlas|smallbatchatlas|collectionatlas|craftatlas|finegroundsatlas|restatlas|fieldatlas|corneratlas|foundatlas|tableatlas|wayatlas)\.com\.au/i
  const targets = rows.filter(r => rank(r.opening_hours_source) < 2 && !ATLAS.test(r.website || ''))
  const ck = loadCkpt()
  console.log(`DRY=${DRY} targets=${targets.length}`)
  const res = { found: 0, none: 0, fetch_fail: 0, skip_done: 0 }; const nowISO = new Date().toISOString(); let i = 0
  async function worker() {
    while (i < targets.length) { const t = targets[i++]; if (ck.done[t.id]) { res.skip_done++; continue }
      let u = t.website; if (!/^https?:\/\//i.test(u)) u = 'https://' + u
      const html = await fetchHtml(u); if (html == null) { res.fetch_fail++; ck.done[t.id] = 'fetchfail'; continue }
      const hrs = findHours(extractJsonLd(html)); if (!hrs) { res.none++; ck.done[t.id] = 'none'; continue }
      res.found++; ck.done[t.id] = 'found'
      if (!DRY) await pool.query(`update listings set opening_hours=$1, opening_hours_status='published', opening_hours_source='operator_website', opening_hours_fetched_at=$2 where id=$3 and coalesce(opening_hours_source,'') in ('','google')`, [JSON.stringify(hrs), nowISO, t.id])
      if (res.found % 25 === 0) { saveCkpt(ck); console.log(`  found=${res.found} none=${res.none} fail=${res.fetch_fail} (@${i}/${targets.length})`) }
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()))
  saveCkpt(ck)
  console.log('\nRESULT', res)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
