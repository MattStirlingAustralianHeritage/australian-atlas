#!/usr/bin/env node
// Render ALL region names into a target locale, update region_translations.name
// (name column only, where a row for that locale exists), and emit the full
// en→locale map for the static *_REGION_LABELS in lib/i18n/listingLabels.js
// (used on cards + the place/region pages, English fallback).
//
// Usage: node scripts/translate-region-names.mjs [--locale ko|zh]
import pg from 'pg'; import fs from 'fs'; import path from 'path'; import url from 'url'; import dotenv from 'dotenv'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true })
const { default: Anthropic } = await import('@anthropic-ai/sdk')
const argv = process.argv.slice(2)
const li = argv.indexOf('--locale'); const LOCALE = (li !== -1 && argv[li + 1]) ? argv[li + 1] : 'ko'
const OUT_DIR = '/private/tmp/claude-501/-Users-matt-Desktop-Australian-Atlas-Websites/03a47a1a-b53d-45dd-9191-fc4100a727d3/scratchpad'

// Each prompt returns a JSON array of {"id":<id>,"t":"<rendered>"}.
const PROMPTS = {
  ko: `You transliterate Australian region/place names into Korean (Hangul) for a travel guide. For each name give the natural Korean reading — transliterate proper nouns phonetically (e.g. "Riverina"→"리베리나", "Byron Bay"→"바이런 베이", "Barossa Valley"→"바로사 밸리"); you may translate a trailing common word (Valley→밸리, Peninsula→반도, Coast→해안, Hills→힐스, Region→지역, Highlands→하이랜드). Keep the "&" as "&". Output ONLY a JSON array; each element {"id":<id>,"t":"<korean>"}, id echoed verbatim, one per input.`,
  zh: `You render Australian region/place names into Simplified Chinese for a travel guide. Use the standard, widely-used Chinese name where one exists (e.g. "Sydney"→"悉尼", "Melbourne"→"墨尔本", "Brisbane"→"布里斯班", "Perth"→"珀斯", "Adelaide"→"阿德莱德", "Hobart"→"霍巴特", "Tasmania"→"塔斯马尼亚", "Blue Mountains"→"蓝山", "Great Ocean Road"→"大洋路", "Barossa Valley"→"巴罗萨谷", "Byron Bay"→"拜伦湾", "Gold Coast"→"黄金海岸", "Great Barrier Reef"→"大堡礁", "Yarra Valley"→"雅拉谷", "Margaret River"→"玛格丽特河"); otherwise transliterate proper nouns into natural Chinese characters, and you MAY translate a trailing common word (Valley→谷, Peninsula→半岛, Coast→海岸, Hills→丘陵, Ranges→山脉, Region→地区, Highlands→高地, Island→岛, River→河, Hinterland→腹地, Outback→内陆). Keep the "&" as "&". Output ONLY a JSON array; each element {"id":<id>,"t":"<chinese>"}, id echoed verbatim, one per input.`,
}
const SYSTEM = PROMPTS[LOCALE] || PROMPTS.ko

const pool = new pg.Pool({ connectionString: `postgresql://postgres.nyhkcmvhwbydsqsyvizs:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const c = await pool.connect()
try {
  const { rows } = await c.query(`select id, name, state from regions where status='live' and name is not null order by name`)
  const out = []
  for (let i = 0; i < rows.length; i += 40) {
    const batch = rows.slice(i, i + 40)
    const resp = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(batch.map(r => ({ id: r.id, name: r.name }))) }] })
    const t = resp.content.map(b => b.type === 'text' ? b.text : '').join(''); const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); const b = f ? f[1] : t
    const arr = JSON.parse(b.slice(b.indexOf('['), b.lastIndexOf(']') + 1))
    const byId = new Map(arr.map(x => [String(x.id), x.t]))
    for (const r of batch) { const tr = byId.get(String(r.id)); if (tr && String(tr).trim()) out.push({ id: r.id, en: r.name, t: String(tr).trim() }) }
  }
  // Update region_translations.name (only where a row for this locale exists).
  let updated = 0
  for (const o of out) {
    const res = await c.query(`update region_translations set name=$1 where region_id=$2 and locale=$3`, [o.t, o.id, LOCALE])
    updated += res.rowCount
  }
  // Emit the static map (dedup by en name), skipping identity renderings.
  const seen = new Set(); const lines = []
  for (const o of out) { if (o.t === o.en || seen.has(o.en)) continue; seen.add(o.en); lines.push(`  ${JSON.stringify(o.en)}: ${JSON.stringify(o.t)},`) }
  const outFile = path.join(OUT_DIR, `region-map-${LOCALE}.txt`)
  fs.writeFileSync(outFile, lines.join('\n') + '\n')
  console.log(`regions: ${out.length} rendered, ${updated} region_translations updated, ${lines.length} map entries → ${outFile}`)
} finally { c.release(); await pool.end() }
