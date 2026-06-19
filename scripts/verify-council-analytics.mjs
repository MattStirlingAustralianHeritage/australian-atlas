#!/usr/bin/env node
/**
 * End-to-end verification of the council analytics pipeline.
 *
 * Posts synthetic pageviews through the REAL ingest route (POST /api/analytics/ingest)
 * with crafted user-agent + Vercel geo headers, then asserts against the master DB:
 *   1. rows land in `pageviews` with is_bot tagged by isBotUA(ua) || isBotRow(geo)
 *   2. user_agent is stored
 *   3. analytics_region_metrics groups the real (human) events by the right region
 *      and EXCLUDES the bot rows
 * Finally it deletes ONLY the rows it inserted (matched by a unique sentinel
 * visitor_id) — test scaffolding cleanup, never user data.
 *
 * Usage:  BASE_URL=http://localhost:3457 node scripts/verify-council-analytics.mjs
 * Env:    SUPABASE_DB_PASSWORD (from .env.local, same path as run-migration.mjs)
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
function loadEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  } catch {}
}
loadEnv()

const BASE_URL = process.env.BASE_URL || 'http://localhost:3457'
const ref = 'nyhkcmvhwbydsqsyvizs'
const password = process.env.SUPABASE_DB_PASSWORD
if (!password) { console.error('Set SUPABASE_DB_PASSWORD in .env.local'); process.exit(1) }

const SENTINEL = `synth-verify-${process.pid}-${Date.now()}`
const since = new Date(Date.now() - 365 * 86400000).toISOString()

// Two real, region-attributable listing slugs (overridable via argv for reuse).
const MEL = { region: 'melbourne', slug: process.argv[2] || '1000-degrees-glass-studios' }
const SYD = { region: 'sydney', slug: process.argv[3] || '2-halfs-brewing-and-distilling' }

const pool = new pg.Pool({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
})

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

async function post(ev) {
  const res = await fetch(`${BASE_URL}/api/analytics/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': ev.ua,
      'x-vercel-ip-country': ev.country,
      'x-vercel-ip-city': ev.city,
    },
    body: JSON.stringify({ vertical: 'portal', page_path: ev.path, visitor_id: SENTINEL }),
  })
  return res.status
}

async function regionClicks(c, region) {
  const r = await c.query(`select id, slug, name, state from regions where slug=$1`, [region])
  if (!r.rows.length) return null
  const row = r.rows[0]
  const m = (await c.query(`select analytics_region_metrics($1,$2,$3,$4,$5) as m`,
    [row.id, row.slug, since, [], 10])).rows[0].m
  return Number(m.total_clicks || 0)
}

async function main() {
  console.log(`\n=== Council analytics E2E verification ===`)
  console.log(`BASE_URL=${BASE_URL}  sentinel=${SENTINEL}\n`)
  const c = await pool.connect()
  try {
    // Baseline RPC clicks (bot-excluded) before inserting.
    const melBefore = await regionClicks(c, MEL.region)
    const sydBefore = await regionClicks(c, SYD.region)
    console.log(`Baseline RPC clicks — Melbourne=${melBefore} Sydney=${sydBefore}\n`)

    // 4 synthetic events through the real route.
    const events = [
      { name: 'E1 Melbourne human',    path: `/place/${MEL.slug}`, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15', country: 'AU', city: 'Melbourne', expectBot: false, region: 'melbourne' },
      { name: 'E2 Sydney human',       path: `/place/${SYD.slug}`, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',                country: 'AU', city: 'Sydney',    expectBot: false, region: 'sydney' },
      { name: 'E3 Melbourne UA-bot',   path: `/place/${MEL.slug}`, ua: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',                  country: 'AU', city: 'Melbourne', expectBot: true,  region: 'melbourne' },
      { name: 'E4 Melbourne geo-bot',  path: `/place/${MEL.slug}`, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15',                       country: 'SG', city: 'Singapore', expectBot: true,  region: 'melbourne' },
    ]
    console.log('Posting synthetic events through POST /api/analytics/ingest:')
    for (const ev of events) {
      const status = await post(ev)
      check(`${ev.name} -> route ${status}`, status === 200, ev.path)
    }

    // small settle
    await new Promise((r) => setTimeout(r, 600))

    // 1) Rows landed with correct is_bot + user_agent.
    const rows = (await c.query(
      `select path, is_bot, user_agent, country, city from pageviews where visitor_id=$1 order by id`, [SENTINEL])).rows
    console.log(`\nStored rows for sentinel: ${rows.length}`)
    check('4 synthetic rows landed', rows.length === 4, `${rows.length}/4`)
    for (let i = 0; i < events.length; i++) {
      const ev = events[i], row = rows[i]
      if (!row) { check(`${ev.name} row present`, false); continue }
      check(`${ev.name} is_bot=${ev.expectBot}`, row.is_bot === ev.expectBot, `got is_bot=${row.is_bot}`)
      check(`${ev.name} user_agent stored`, !!row.user_agent, row.user_agent ? row.user_agent.slice(0, 24) + '…' : 'null')
    }

    // 2) RPC region grouping + bot exclusion (delta vs baseline).
    const melAfter = await regionClicks(c, MEL.region)
    const sydAfter = await regionClicks(c, SYD.region)
    console.log(`\nRPC clicks after insert — Melbourne=${melAfter} (Δ${melAfter - melBefore}) Sydney=${sydAfter} (Δ${sydAfter - sydBefore})`)
    // Melbourne got 3 synthetic /place hits but only 1 is human (E1); E3/E4 are bots.
    check('Melbourne RPC +1 (human only; 2 bots excluded)', melAfter - melBefore === 1, `Δ=${melAfter - melBefore}, expected 1`)
    check('Sydney RPC +1 (human)', sydAfter - sydBefore === 1, `Δ=${sydAfter - sydBefore}, expected 1`)

    // Sentinel-scoped definitive check (immune to concurrent live traffic): the
    // RPC's own filter (is_bot=false, /place/%) over only my rows must yield E1+E2.
    const humanScoped = (await c.query(
      `select count(*)::int n from pageviews where visitor_id=$1 and is_bot=false and path like '/place/%'`, [SENTINEL])).rows[0].n
    check('Exactly 2 sentinel rows pass the human /place filter', humanScoped === 2, `got ${humanScoped}`)

    // 3) Cleanup — delete ONLY my synthetic rows, by sentinel.
    const del = await c.query(`delete from pageviews where visitor_id=$1`, [SENTINEL])
    console.log(`\nCleanup: deleted ${del.rowCount} synthetic row(s) by sentinel`)
    check('Deleted exactly the 4 synthetic rows', del.rowCount === 4, `${del.rowCount}/4`)
    const leftover = (await c.query(`select count(*)::int n from pageviews where visitor_id=$1`, [SENTINEL])).rows[0].n
    check('No sentinel rows remain', leftover === 0, `${leftover} left`)
    const melFinal = await regionClicks(c, MEL.region)
    const sydFinal = await regionClicks(c, SYD.region)
    check('Melbourne RPC back to baseline', melFinal === melBefore, `${melFinal} vs ${melBefore}`)
    check('Sydney RPC back to baseline', sydFinal === sydBefore, `${sydFinal} vs ${sydBefore}`)
  } finally {
    c.release(); await pool.end()
  }
  console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error('VERIFY_ERROR:', e.code || '', e.message); process.exit(2) })
