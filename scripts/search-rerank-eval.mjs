#!/usr/bin/env node
/**
 * Search reranking eval — measures PHRASING CONVERGENCE (the "two phrasings, two
 * drastically different result sets" complaint) and exact-name safety.
 *
 * For each intent we issue several paraphrases. A good search returns nearly the
 * same top results regardless of wording. We measure mean pairwise Jaccard of the
 * top-3 across an intent's paraphrases, and top-1 agreement, BEFORE (live fused
 * order) vs AFTER (the cross-encoder rerank stage applied to the same pool).
 *
 * Usage: node --env-file=.env.local scripts/search-rerank-eval.mjs
 */
import { rerankSearchResults } from '../lib/search/rerank.js'
import { parseQueryLocation } from '../lib/search/parseQuery.js'

const BASE = process.env.EVAL_BASE || 'https://www.australianatlas.com.au'
const TOPN = parseInt(process.env.EVAL_TOPN || '50', 10)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fused(q) {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}&limit=${Math.min(TOPN, 100)}`)
  const d = await res.json().catch(() => ({}))
  return d.listings || []
}
const rerank = (cleaned, listings) => rerankSearchResults(null, cleaned, listings, { topN: TOPN })

// Paraphrase sets: each intent, several wordings that should converge.
const INTENTS = [
  { name: 'wood-fired brewery', qs: [
    'wood fired brewery',
    'a brewery that uses ovens with wood',
    'brewery with a wood fired oven',
    'brewery that brews over a wood fire',
  ] },
  { name: 'specialty coffee roaster', qs: [
    'specialty coffee roaster',
    'cafe that roasts its own beans',
    'where to get expertly roasted specialty coffee',
  ] },
  { name: 'natural wine cellar door', qs: [
    'natural wine cellar door',
    'winery pouring natural wines',
    'place to taste minimal intervention wine',
  ] },
  { name: 'pottery studio to visit', qs: [
    'pottery studio I can visit',
    'ceramicist with an open studio',
    'handmade ceramics studio open to visitors',
  ] },
  { name: 'quiet rural farm stay', qs: [
    'quiet farm stay',
    'peaceful place to stay on a farm',
    'secluded farmhouse accommodation',
  ] },
  { name: 'secondhand bookshop', qs: [
    'secondhand bookshop',
    'shop selling used books',
    'store full of preloved books',
  ] },
  { name: 'distillery tasting', qs: [
    'gin distillery with tastings',
    'distillery where you can taste the spirits',
    'place to sample craft gin',
  ] },
]

// Exact-name lookups: rerank must keep the named venue at #1.
const EXACT = [
  { q: 'Robe Town Brewery', expect: 'Robe Town Brewery' },
  { q: 'Du Cane Brewing', expect: 'Du Cane' },
  { q: 'Stone & Wood', expect: 'Stone & Wood' },
]

function top3(listings) { return listings.slice(0, 3).map((l) => l.slug || l.name) }
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b)
  const inter = [...A].filter((x) => B.has(x)).length
  const uni = new Set([...A, ...B]).size
  return uni ? inter / uni : 1
}
function meanPairwiseJaccard(sets) {
  let sum = 0, n = 0
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) { sum += jaccard(sets[i], sets[j]); n++ }
  return n ? sum / n : 1
}
function top1Agreement(tops) {
  const counts = new Map()
  for (const t of tops) counts.set(t[0], (counts.get(t[0]) || 0) + 1)
  const max = Math.max(...counts.values())
  return max / tops.length
}

const beforeJ = [], afterJ = [], beforeA = [], afterA = []

for (const intent of INTENTS) {
  const beforeTops = [], afterTops = []
  for (const q of intent.qs) {
    const listings = await fused(q)
    const cleaned = parseQueryLocation(q).cleaned
    const { listings: reranked } = await rerank(cleaned, listings)
    beforeTops.push(top3(listings))
    afterTops.push(top3(reranked))
    await sleep(500)
  }
  const bJ = meanPairwiseJaccard(beforeTops), aJ = meanPairwiseJaccard(afterTops)
  const bA = top1Agreement(beforeTops), aA = top1Agreement(afterTops)
  beforeJ.push(bJ); afterJ.push(aJ); beforeA.push(bA); afterA.push(aA)
  const arrow = aJ > bJ + 0.001 ? '↑' : aJ < bJ - 0.001 ? '↓' : '='
  console.log(`\n■ ${intent.name}`)
  console.log(`   top-3 convergence (Jaccard):  ${bJ.toFixed(2)} → ${aJ.toFixed(2)}  ${arrow}`)
  console.log(`   top-1 agreement:              ${bA.toFixed(2)} → ${aA.toFixed(2)}`)
  // show AFTER #1 per phrasing for eyeballing
  intent.qs.forEach((q, i) => console.log(`     "${q}" → ${afterTops[i][0]}`))
}

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length
console.log('\n══════════════ SUMMARY ══════════════')
console.log(`Mean top-3 convergence:  ${avg(beforeJ).toFixed(3)} → ${avg(afterJ).toFixed(3)}`)
console.log(`Mean top-1 agreement:    ${avg(beforeA).toFixed(3)} → ${avg(afterA).toFixed(3)}`)

console.log('\n── Exact-name safety (named venue must stay #1) ──')
let exactOk = 0
for (const { q, expect } of EXACT) {
  const listings = await fused(q)
  const cleaned = parseQueryLocation(q).cleaned
  const { listings: reranked } = await rerank(cleaned, listings)
  const b1 = listings[0]?.name || '—'
  const a1 = reranked[0]?.name || '—'
  const ok = a1.toLowerCase().includes(expect.toLowerCase())
  if (ok) exactOk++
  console.log(`   "${q}"  before=${b1}  after=${a1}  ${ok ? 'OK' : 'REGRESSION'}`)
  await sleep(500)
}
console.log(`Exact-name preserved: ${exactOk}/${EXACT.length}`)
