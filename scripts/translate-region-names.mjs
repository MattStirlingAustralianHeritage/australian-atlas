#!/usr/bin/env node
// Transliterate ALL region names into Korean (Hangul), update
// region_translations.name (name column only), and emit the full en→ko map for
// the static KO_REGION_LABELS in lib/i18n/listingLabels.js (used on cards + the
// place/region pages, English fallback).
import pg from 'pg'; import fs from 'fs'; import path from 'path'; import url from 'url'; import dotenv from 'dotenv'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true })
const { default: Anthropic } = await import('@anthropic-ai/sdk')
const pool = new pg.Pool({ connectionString: `postgresql://postgres.nyhkcmvhwbydsqsyvizs:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const c = await pool.connect()
try {
  const { rows } = await c.query(`select id, name, state from regions where status='live' and name is not null order by name`)
  const SYSTEM = `You transliterate Australian region/place names into Korean (Hangul) for a travel guide. For each name give the natural Korean reading — transliterate proper nouns phonetically (e.g. "Riverina"→"리베리나", "Byron Bay"→"바이런 베이", "Barossa Valley"→"바로사 밸리"); you may translate a trailing common word (Valley→밸리, Peninsula→반도, Coast→해안, Hills→힐스, Region→지역, Highlands→하이랜드). Keep the "&" as "&". Output ONLY a JSON array; each element {"id":<id>,"ko":"<korean>"}, id echoed verbatim, one per input.`
  const out = []
  for (let i = 0; i < rows.length; i += 40) {
    const batch = rows.slice(i, i + 40)
    const resp = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(batch.map(r => ({ id: r.id, name: r.name }))) }] })
    const t = resp.content.map(b => b.type === 'text' ? b.text : '').join(''); const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); const b = f ? f[1] : t
    const arr = JSON.parse(b.slice(b.indexOf('['), b.lastIndexOf(']') + 1))
    const byId = new Map(arr.map(x => [String(x.id), x.ko]))
    for (const r of batch) { const ko = byId.get(String(r.id)); if (ko && String(ko).trim()) out.push({ id: r.id, en: r.name, ko: String(ko).trim() }) }
  }
  // Update region_translations.name (only where a ko row exists) + upsert map.
  let updated = 0
  for (const o of out) {
    const res = await c.query(`update region_translations set name=$1 where region_id=$2 and locale='ko'`, [o.ko, o.id])
    updated += res.rowCount
  }
  // Emit the static map (dedup by en name).
  const seen = new Set(); const lines = []
  for (const o of out) { if (o.ko === o.en || seen.has(o.en)) continue; seen.add(o.en); lines.push(`  ${JSON.stringify(o.en)}: ${JSON.stringify(o.ko)},`) }
  fs.writeFileSync('/private/tmp/claude-501/-Users-matt-Desktop-Australian-Atlas-Websites/a7fea54a-4240-4276-b370-09ea5883cd7d/scratchpad/region-map-full.txt', lines.join('\n') + '\n')
  console.log(`regions: ${out.length} transliterated, ${updated} region_translations updated, ${lines.length} map entries written.`)
} finally { c.release(); await pool.end() }
