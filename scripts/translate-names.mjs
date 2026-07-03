#!/usr/bin/env node

/**
 * Render listing NAMES into Korean (Hangul) and store them in
 * listing_translations.name (locale ko), updating ONLY the name column so
 * existing Korean descriptions are untouched. Used to power the split-name
 * display (English + Korean) on /ko.
 *
 * Usage: node scripts/translate-names.mjs [--limit N] [--concurrency C] [--batch B]
 */

import pg from 'pg'
import fs from 'fs'
import path from 'path'
import url from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true })
const { default: Anthropic } = await import('@anthropic-ai/sdk')

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i + 1] ? argv[i + 1] : null }
const LIMIT = flag('limit') ? parseInt(flag('limit'), 10) : null
const CONCURRENCY = flag('concurrency') ? parseInt(flag('concurrency'), 10) : 6
const BATCH = flag('batch') ? parseInt(flag('batch'), 10) : 25
const MODEL = 'claude-haiku-4-5-20251001'

const ref = 'nyhkcmvhwbydsqsyvizs'
const pool = new pg.Pool({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You render Australian venue / business NAMES into Korean (Hangul) for a travel directory's Korean readers.
Rules:
- Output a natural Korean reading of the name. Transliterate proper nouns and brand words phonetically into Hangul (e.g. "Tar Barrel" → "타르 배럴", "Jackalope" → "재칼로프", "Wynns" → "윈스").
- You MAY translate common descriptive words: Brewery→브루어리, Distillery→증류소, Winery→와이너리, Estate→에스테이트, Roasters→로스터스, Coffee→커피, Gallery→갤러리, Studio→스튜디오, Ceramics→세라믹, Hotel→호텔, Bakery→베이커리, Wines→와인, Farm→팜, Cellar Door→셀러 도어.
- Keep it concise and readable. Do NOT include the English, quotes, parentheses, or notes — output ONLY the Korean rendering.
- Return ONLY a JSON array; each element {"id": <same id>, "ko": "<korean rendering>"}, one per input, same order, id echoed verbatim.`

function extractJson(t) { const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); const b = f ? f[1] : t; const s = b.indexOf('['); const e = b.lastIndexOf(']'); return JSON.parse(b.slice(s, e + 1)) }

async function translateBatch(items) {
  const resp = await anthropic.messages.create({
    model: MODEL, max_tokens: 2048, system: SYSTEM,
    messages: [{ role: 'user', content: `Render these ${items.length} names into Korean. JSON array only.\n${JSON.stringify(items.map(i => ({ id: i.id, name: i.name })))}` }],
  })
  const parsed = extractJson(resp.content.map(b => b.type === 'text' ? b.text : '').join(''))
  const byId = new Map(parsed.map(p => [String(p.id), p]))
  return items.map(it => {
    const ko = byId.get(String(it.id))?.ko
    return { id: it.id, ko: ko && String(ko).trim() ? String(ko).trim() : null }
  }).filter(r => r.ko)
}

async function runPool(tasks, c, onDone) {
  let i = 0, done = 0; const out = []
  async function w() { while (i < tasks.length) { const idx = i++; try { out[idx] = await tasks[idx]() } catch (e) { out[idx] = { error: e.message } } done++; onDone && onDone(done, tasks.length) } }
  await Promise.all(Array.from({ length: Math.min(c, tasks.length) }, w)); return out
}

const client = await pool.connect()
try {
  // Only listings that already have a ko translation row (so we UPDATE name only).
  const { rows } = await client.query(`
    select l.id, l.name from listings l
    join listing_translations t on t.listing_id = l.id and t.locale='ko'
    where l.status='active' and l.name is not null and t.name = l.name`)
  let items = rows
  if (LIMIT) items = items.slice(0, LIMIT)
  console.log(`Names to render: ${items.length}`)

  const batches = []
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH))

  let inTok = 0, outTok = 0
  const pairsAll = []
  const tasks = batches.map(b => async () => {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 2048, system: SYSTEM,
      messages: [{ role: 'user', content: `Render these ${b.length} names into Korean. JSON array only.\n${JSON.stringify(b.map(i => ({ id: i.id, name: i.name })))}` }],
    })
    inTok += resp.usage?.input_tokens || 0; outTok += resp.usage?.output_tokens || 0
    const parsed = extractJson(resp.content.map(x => x.type === 'text' ? x.text : '').join(''))
    const byId = new Map(parsed.map(p => [String(p.id), p]))
    const pairs = b.map(it => ({ id: it.id, ko: byId.get(String(it.id))?.ko })).filter(p => p.ko && String(p.ko).trim())
    return pairs
  })
  const results = await runPool(tasks, CONCURRENCY, (d, t) => { if (d % 10 === 0 || d === t) process.stdout.write(`\r  batches ${d}/${t}`) })
  for (const r of results) if (Array.isArray(r)) pairsAll.push(...r)
  console.log(`\nRendered ${pairsAll.length} names. Bulk updating…`)

  // Bulk UPDATE name only, chunked.
  let updated = 0
  for (let i = 0; i < pairsAll.length; i += 500) {
    const chunk = pairsAll.slice(i, i + 500)
    const values = chunk.map((_, j) => `($${j * 2 + 1}::uuid, $${j * 2 + 2}::text)`).join(',')
    const params = chunk.flatMap(p => [p.id, p.ko])
    const res = await client.query(
      `update listing_translations as t set name = v.name from (values ${values}) as v(id, name)
       where t.listing_id = v.id and t.locale = 'ko'`, params)
    updated += res.rowCount
  }
  const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5
  console.log(`Updated ${updated} rows. Tokens in=${inTok} out=${outTok}. Est cost $${cost.toFixed(2)}.`)
} finally {
  client.release(); await pool.end()
}
