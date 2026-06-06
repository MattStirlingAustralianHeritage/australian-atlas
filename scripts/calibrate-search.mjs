#!/usr/bin/env node
/**
 * Phase 7 calibration probe. Embeds the five canonical probes (input_type
 * "query") and runs each through search_listings_hybrid at similarity_floor=0
 * to expose the raw similarity / fused-score distribution, then prints what an
 * off-topic query scores so a floor can be chosen between signal and noise.
 * Paced for the Voyage free tier (3 RPM).
 * Usage: node --env-file=.env.local scripts/calibrate-search.mjs
 */
import pg from 'pg'
import { embedQuery } from '../lib/embeddings/voyage.js'

const PROBES = [
  { label: 'exact-name      ', q: 'Northbridge Brewing Company' },
  { label: 'vibe            ', q: 'quiet by-appointment ceramic studio in the bush' },
  { label: 'cross-vertical  ', q: 'places to spend a slow weekend in northern Tasmania' },
  { label: 'off-topic       ', q: 'cheap airport parking' },
  { label: 'near-synonym    ', q: 'somewhere to taste regional shiraz and grenache' },
]

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 })
await c.connect()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

for (let i = 0; i < PROBES.length; i++) {
  const p = PROBES[i]
  let lit = null
  try {
    const emb = await embedQuery(p.q)
    lit = emb ? '[' + emb.join(',') + ']' : null
  } catch (e) {
    console.log(`\n=== ${p.label} "${p.q}" — EMBED ERROR: ${e.message}`)
  }
  const r = await c.query(
    'select name, vertical, round(similarity::numeric,4) sim, round(fused_score::numeric,5) fused ' +
    'from search_listings_hybrid($1,$2,null,null,null,8,0.0,false)',
    [lit, p.q]
  )
  console.log(`\n=== ${p.label} "${p.q}"  (vector_arm=${!!lit}) ===`)
  if (!r.rows.length) console.log('   (no results)')
  for (const x of r.rows) {
    console.log(`   sim=${x.sim ?? 'null '}  fused=${x.fused}  ${x.name} [${x.vertical}]`)
  }
  if (i < PROBES.length - 1) await sleep(21000) // free-tier pacing
}
await c.end()
console.log('\n[calibration probe complete]')
